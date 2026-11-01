// Phase 3 data-quality tests: every exercise has >=1 primary muscle and a
// difficulty rating, tag references are valid, the seed is idempotent, and
// a manual spot-check sample confirms correct tagging (plan.md Phase 3
// "Tests" and acceptance criteria). Run with:
//   node --test supabase/tests/content.test.mjs

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { applyExerciseSeed, applyFoodSeeds, asSuperuser, bootDatabase } from './support/harness.mjs';

let db;

before(async () => {
  ({ db } = await bootDatabase());
  await applyExerciseSeed(db);
  await applyFoodSeeds(db);
});

after(async () => {
  await db.close();
});

describe('Phase 3: seed row counts match the generated dataset', () => {
  test('muscle groups, equipment items, and exercises are all seeded', async () => {
    const muscleGroups = await asSuperuser(
      db,
      'select count(*)::int as n from public.muscle_groups',
    );
    const equipmentItems = await asSuperuser(
      db,
      'select count(*)::int as n from public.equipment_items',
    );
    const exercises = await asSuperuser(db, 'select count(*)::int as n from public.exercises');

    assert.equal(muscleGroups.rows[0].n, 17);
    assert.equal(equipmentItems.rows[0].n, 12);
    assert.equal(exercises.rows[0].n, 876);
  });
});

describe('Phase 3: data quality (every exercise has >=1 primary muscle and a difficulty)', () => {
  test('no exercise is missing a primary muscle tag', async () => {
    const { rows } = await asSuperuser(
      db,
      `select count(*)::int as n from public.exercises e
       where not exists (
         select 1 from public.exercise_muscles em
         where em.exercise_id = e.id and em.role = 'primary'
       )`,
    );
    assert.equal(rows[0].n, 0, 'every exercise must have at least one primary muscle');
  });

  test('every exercise has a valid, non-null difficulty', async () => {
    const { rows } = await asSuperuser(
      db,
      `select count(*)::int as n from public.exercises
       where difficulty is null or difficulty not in ('beginner', 'intermediate', 'advanced')`,
    );
    assert.equal(rows[0].n, 0);
  });

  test('every exercise has a source category, and mechanic is compound/isolation/null (migration 0010)', async () => {
    const { rows } = await asSuperuser(
      db,
      `select count(*)::int as n from public.exercises
       where category is null or (mechanic is not null and mechanic not in ('compound', 'isolation'))`,
    );
    assert.equal(rows[0].n, 0);
    const smr = await asSuperuser(db, `select category from public.exercises where name = 'Iliotibial Tract-SMR'`);
    assert.equal(smr.rows[0].category, 'stretching');
    const bench = await asSuperuser(
      db,
      `select category, mechanic from public.exercises where name = 'Barbell Bench Press - Medium Grip'`,
    );
    assert.deepEqual(bench.rows[0], { category: 'strength', mechanic: 'compound' });
  });

  test('every exercise_muscles row references a real exercise and a real muscle group', async () => {
    const { rows } = await asSuperuser(
      db,
      `select count(*)::int as n from public.exercise_muscles em
       left join public.exercises e on e.id = em.exercise_id
       left join public.muscle_groups mg on mg.id = em.muscle_group_id
       where e.id is null or mg.id is null`,
    );
    assert.equal(
      rows[0].n,
      0,
      'no orphaned taxonomy references (also structurally guaranteed by FK constraints)',
    );
  });

  test('every exercise_equipment row references a real exercise and a real equipment item', async () => {
    const { rows } = await asSuperuser(
      db,
      `select count(*)::int as n from public.exercise_equipment ee
       left join public.exercises e on e.id = ee.exercise_id
       left join public.equipment_items ei on ei.id = ee.equipment_item_id
       where e.id is null or ei.id is null`,
    );
    assert.equal(rows[0].n, 0);
  });

  test('no exercise is tagged with the same muscle group as both primary and secondary', async () => {
    const { rows } = await asSuperuser(
      db,
      `select exercise_id, muscle_group_id, count(*)::int as n
       from public.exercise_muscles
       group by exercise_id, muscle_group_id
       having count(*) > 1`,
    );
    assert.equal(rows.length, 0);
  });
});

describe('Phase 3: seed is idempotent (re-running does not duplicate rows)', () => {
  test('applying the seed a second time leaves row counts unchanged', async () => {
    const before_ = await asSuperuser(
      db,
      `select
        (select count(*)::int from public.exercises) as exercises,
        (select count(*)::int from public.exercise_muscles) as muscles,
        (select count(*)::int from public.exercise_equipment) as equipment,
        (select count(*)::int from public.muscle_groups) as muscle_groups,
        (select count(*)::int from public.equipment_items) as equipment_items`,
    );

    await applyExerciseSeed(db);

    const after_ = await asSuperuser(
      db,
      `select
        (select count(*)::int from public.exercises) as exercises,
        (select count(*)::int from public.exercise_muscles) as muscles,
        (select count(*)::int from public.exercise_equipment) as equipment,
        (select count(*)::int from public.muscle_groups) as muscle_groups,
        (select count(*)::int from public.equipment_items) as equipment_items`,
    );

    assert.deepEqual(after_.rows[0], before_.rows[0]);
  });
});

describe('Phase 3: manual spot-check of a sample of exercises (acceptance criterion)', () => {
  async function tagsFor(name) {
    const exercise = await asSuperuser(
      db,
      'select id, difficulty from public.exercises where name = $1',
      [name],
    );
    assert.equal(exercise.rows.length, 1, `expected exactly one exercise named "${name}"`);
    const id = exercise.rows[0].id;

    const muscles = await asSuperuser(
      db,
      `select mg.key, em.role from public.exercise_muscles em
       join public.muscle_groups mg on mg.id = em.muscle_group_id
       where em.exercise_id = $1
       order by em.role, mg.key`,
      [id],
    );
    const equipment = await asSuperuser(
      db,
      `select ei.key, ei.category from public.exercise_equipment ee
       join public.equipment_items ei on ei.id = ee.equipment_item_id
       where ee.exercise_id = $1`,
      [id],
    );
    return {
      difficulty: exercise.rows[0].difficulty,
      muscles: muscles.rows,
      equipment: equipment.rows,
    };
  }

  test('"Barbell Bench Press - Medium Grip": chest primary, shoulders/triceps secondary, barbell (free_weights), beginner', async () => {
    const result = await tagsFor('Barbell Bench Press - Medium Grip');
    assert.equal(result.difficulty, 'beginner');
    assert.deepEqual(
      result.muscles.map((m) => `${m.role}:${m.key}`),
      ['primary:chest', 'secondary:shoulders', 'secondary:triceps'],
    );
    assert.deepEqual(result.equipment, [{ key: 'barbell', category: 'free_weights' }]);
  });

  test('"Pullups": lats primary, biceps/middle_back secondary, bodyweight (bodyweight_other)', async () => {
    const result = await tagsFor('Pullups');
    assert.equal(result.difficulty, 'beginner');
    assert.deepEqual(
      result.muscles.map((m) => `${m.role}:${m.key}`),
      ['primary:lats', 'secondary:biceps', 'secondary:middle_back'],
    );
    assert.deepEqual(result.equipment, [{ key: 'bodyweight', category: 'bodyweight_other' }]);
  });

  test('"Barbell Squat": quadriceps primary, four secondary muscles, barbell', async () => {
    const result = await tagsFor('Barbell Squat');
    assert.equal(result.difficulty, 'beginner');
    assert.deepEqual(
      result.muscles.map((m) => `${m.role}:${m.key}`),
      [
        'primary:quadriceps',
        'secondary:calves',
        'secondary:glutes',
        'secondary:hamstrings',
        'secondary:lower_back',
      ],
    );
    assert.deepEqual(result.equipment, [{ key: 'barbell', category: 'free_weights' }]);
  });

  test('"Handstand Push-Ups": source level "expert" maps to difficulty "advanced"', async () => {
    const result = await tagsFor('Handstand Push-Ups');
    assert.equal(result.difficulty, 'advanced');
    assert.deepEqual(
      result.muscles.map((m) => `${m.role}:${m.key}`),
      ['primary:shoulders', 'secondary:triceps'],
    );
  });

  test('"Decline Push-Up": source equipment null maps to zero equipment rows (no requirement, not "other")', async () => {
    const result = await tagsFor('Decline Push-Up');
    assert.deepEqual(result.equipment, []);
  });
});

describe('Phase 9: USDA food seed (docs/licensing/food-dataset-licenses.md)', () => {
  test('loads every generated food plus the barcode demo rows, all external and per 100g', async () => {
    const { rows } = await asSuperuser(
      db,
      `select count(*) filter (where barcode is null)::int as generic,
              count(*) filter (where barcode is not null)::int as barcoded,
              count(*) filter (where source <> 'external' or created_by_user_id is not null)::int as non_external,
              count(*) filter (where barcode is null and portion_description <> '100g')::int as non_100g
       from public.food_items`,
    );
    assert.equal(rows[0].generic, 7448);
    assert.equal(rows[0].barcoded, 5);
    assert.equal(rows[0].non_external, 0);
    assert.equal(rows[0].non_100g, 0);
  });

  test('spot-check: reference values match USDA SR Legacy', async () => {
    const { rows } = await asSuperuser(
      db,
      `select calories_per_portion::float as kcal, protein_g_per_portion::float as protein,
              carbs_g_per_portion::float as carbs, fat_g_per_portion::float as fat
       from public.food_items where name = 'Chicken, broilers or fryers, breast, meat only, cooked, roasted'`,
    );
    assert.deepEqual(rows[0], { kcal: 165, protein: 31, carbs: 0, fat: 3.6 });
  });

  test('re-applying the food seeds does not duplicate rows', async () => {
    const before_ = await asSuperuser(db, 'select count(*)::int as n from public.food_items');
    await applyFoodSeeds(db);
    const after_ = await asSuperuser(db, 'select count(*)::int as n from public.food_items');
    assert.equal(after_.rows[0].n, before_.rows[0].n);
  });
});
