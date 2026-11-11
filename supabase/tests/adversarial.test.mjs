// Executable Phase 1 adversarial RLS + DR-5 test suite, run with:
//   node --test supabase/tests/adversarial.test.mjs
//
// This exercises the migrations in /supabase/migrations against a real
// Postgres engine (PGlite) via the harness in ./support/harness.mjs,
// switching Postgres roles and JWT-claim GUCs exactly as PostgREST would
// on a real request. It is the executable counterpart to the canonical
// pgTAP suite in rls_adversarial.sql, which is what `supabase test db`
// should run once Docker/the Supabase CLI is available; this file exists
// because that wasn't available in the environment this was written in.
//
// Required coverage (plan.md Phase 1 "Tests"):
//   (a) user A cannot read user B's rows, on every user-scoped table
//   (b) user A cannot update user B's rows, on every user-scoped table
//   (c) user A cannot delete user B's rows, on every user-scoped table
//   (d) unauthenticated requests are rejected outright
//   (e) service-role-only operations are unreachable via anon/authenticated
//   plus DR-5: regeneration versioning and historical attribution.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  asAnon,
  asServiceRole,
  asSuperuser,
  asUser,
  bootDatabase,
  seedUser,
} from './support/harness.mjs';

let db;
let userA;
let userB;
let shared; // { exerciseId, equipmentItemId }

before(async () => {
  ({ db } = await bootDatabase());
  userA = await seedUser(db, { age: 25 });
  userB = await seedUser(db, { age: 40 });

  const exercise = await asSuperuser(
    db,
    `insert into public.exercises (name, difficulty) values ('Bodyweight Squat', 'beginner') returning id`,
  );
  const equipment = await asSuperuser(
    db,
    `insert into public.equipment_items (key, display_name, category)
     values ('bodyweight', 'Bodyweight', 'bodyweight_other') returning id`,
  );
  shared = { exerciseId: exercise.rows[0].id, equipmentItemId: equipment.rows[0].id };
});

after(async () => {
  await db.close();
});

// ---------------------------------------------------------------------
// Migration apply (and "reset" repeatability)
// ---------------------------------------------------------------------

describe('migration apply', () => {
  test('all 11 migrations apply in order and produce the expected schema', async () => {
    const { rows } = await asSuperuser(
      db,
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );
    const tables = rows.map((r) => r.table_name);
    for (const expected of [
      'profiles',
      'equipment_items',
      'user_equipment',
      'muscle_groups',
      'exercises',
      'exercise_muscles',
      'exercise_equipment',
      'workout_plans',
      'planned_sessions',
      'planned_session_exercises',
      'workout_sessions',
      'set_logs',
      'progression_suggestions',
      'nutrition_targets',
      'food_items',
      'food_log_entries',
      'weight_entries',
      'personal_records',
      'schedule_adjustments',
    ]) {
      assert.ok(tables.includes(expected), `expected table ${expected} to exist`);
    }
  });

  test('migrations are repeatable from a clean state (reset-equivalent)', async () => {
    // Supabase's migration workflow is forward-apply + `db reset` (replay
    // from scratch) rather than per-migration down-scripts, which this
    // plan's migration files don't include. This test proves the same
    // migration set applies cleanly a second time against an independent
    // fresh database, i.e. it is not order- or state-dependent on
    // anything outside the migrations themselves.
    const second = await bootDatabase();
    const { rows } = await asSuperuser(
      second.db,
      `select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    assert.equal(second.applied.length, 11);
    assert.ok(rows[0].n >= 18);
    await second.db.close();
  });
});

describe('OQ-6: profiles.biological_sex accepts exactly the resolved value set', () => {
  test('male, female, and prefer_not_to_say are all accepted', async () => {
    for (const value of ['male', 'female', 'prefer_not_to_say']) {
      const user = await asSuperuser(db, 'insert into auth.users default values returning id');
      const userId = user.rows[0].id;
      await assert.doesNotReject(
        asSuperuser(
          db,
          `insert into public.profiles
            (user_id, age, height_cm, weight_kg, biological_sex, fitness_level, goal, training_days_per_week)
           values ($1, 30, 175, 75, $2, 'beginner', 'general_fitness', 3)`,
          [userId, value],
        ),
        `biological_sex = '${value}' should be accepted`,
      );
    }
  });

  test('any other value is rejected by the CHECK constraint (per docs/decisions/OQ-6-biological-sex.md)', async () => {
    const user = await asSuperuser(db, 'insert into auth.users default values returning id');
    const userId = user.rows[0].id;
    await assert.rejects(
      asSuperuser(
        db,
        `insert into public.profiles
          (user_id, age, height_cm, weight_kg, biological_sex, fitness_level, goal, training_days_per_week)
         values ($1, 30, 175, 75, 'non_binary', 'beginner', 'general_fitness', 3)`,
        [userId],
      ),
      /violates check constraint/i,
      'OQ-6 was resolved to exactly three values; anything else must be rejected, not silently widened',
    );
  });
});

// ---------------------------------------------------------------------
// (a)(b)(c): cross-user read/update/delete rejection, every user-scoped table
// ---------------------------------------------------------------------

async function seedRow(spec) {
  return spec.seed();
}

const specs = [
  {
    name: 'profiles',
    // profiles is seeded via seedUser; use userA's own row directly.
    seed: async () => userA,
    select: (id) => ({ sql: 'select 1 from public.profiles where user_id = $1', params: [id] }),
    update: (id) => ({
      sql: 'update public.profiles set age = 99 where user_id = $1',
      params: [id],
    }),
    delete: (id) => ({ sql: 'delete from public.profiles where user_id = $1', params: [id] }),
  },
  {
    name: 'user_equipment',
    seed: async () => {
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.user_equipment (user_id, equipment_item_id) values ($1, $2) returning user_id as id`,
        [userA, shared.equipmentItemId],
      );
      return rows[0].id;
    },
    select: (id) => ({
      sql: 'select 1 from public.user_equipment where user_id = $1',
      params: [id],
    }),
    update: null,
    delete: (id) => ({ sql: 'delete from public.user_equipment where user_id = $1', params: [id] }),
  },
  {
    name: 'workout_plans',
    seed: async () => {
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id`,
        [userA],
      );
      return rows[0].id;
    },
    select: (id) => ({ sql: 'select 1 from public.workout_plans where id = $1', params: [id] }),
    update: (id) => ({
      sql: "update public.workout_plans set split_type = 'upper_lower' where id = $1",
      params: [id],
    }),
    delete: (id) => ({ sql: 'delete from public.workout_plans where id = $1', params: [id] }),
  },
  {
    name: 'planned_sessions',
    seed: async () => {
      const plan = await asUser(
        db,
        userA,
        `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id`,
        [userA],
      );
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.planned_sessions (workout_plan_id, user_id, day_order, name) values ($1, $2, 1, 'Day 1') returning id`,
        [plan.rows[0].id, userA],
      );
      return rows[0].id;
    },
    select: (id) => ({ sql: 'select 1 from public.planned_sessions where id = $1', params: [id] }),
    update: (id) => ({
      sql: "update public.planned_sessions set name = 'Renamed' where id = $1",
      params: [id],
    }),
    delete: (id) => ({ sql: 'delete from public.planned_sessions where id = $1', params: [id] }),
  },
  {
    name: 'planned_session_exercises',
    seed: async () => {
      const plan = await asUser(
        db,
        userA,
        `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id`,
        [userA],
      );
      const session = await asUser(
        db,
        userA,
        `insert into public.planned_sessions (workout_plan_id, user_id, day_order, name) values ($1, $2, 1, 'Day 1') returning id`,
        [plan.rows[0].id, userA],
      );
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.planned_session_exercises (planned_session_id, user_id, exercise_id, order_index, target_sets, target_reps_min)
         values ($1, $2, $3, 1, 3, 8) returning id`,
        [session.rows[0].id, userA, shared.exerciseId],
      );
      return rows[0].id;
    },
    select: (id) => ({
      sql: 'select 1 from public.planned_session_exercises where id = $1',
      params: [id],
    }),
    update: (id) => ({
      sql: 'update public.planned_session_exercises set target_sets = 5 where id = $1',
      params: [id],
    }),
    delete: (id) => ({
      sql: 'delete from public.planned_session_exercises where id = $1',
      params: [id],
    }),
  },
  {
    name: 'workout_sessions',
    seed: async () => {
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.workout_sessions (user_id) values ($1) returning id`,
        [userA],
      );
      return rows[0].id;
    },
    select: (id) => ({ sql: 'select 1 from public.workout_sessions where id = $1', params: [id] }),
    update: (id) => ({
      sql: "update public.workout_sessions set status = 'completed' where id = $1",
      params: [id],
    }),
    delete: (id) => ({ sql: 'delete from public.workout_sessions where id = $1', params: [id] }),
  },
  {
    name: 'set_logs',
    seed: async () => {
      const session = await asUser(
        db,
        userA,
        `insert into public.workout_sessions (user_id) values ($1) returning id`,
        [userA],
      );
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.set_logs (workout_session_id, user_id, exercise_id, set_index, weight_kg, reps)
         values ($1, $2, $3, 1, 40, 8) returning id`,
        [session.rows[0].id, userA, shared.exerciseId],
      );
      return rows[0].id;
    },
    select: (id) => ({ sql: 'select 1 from public.set_logs where id = $1', params: [id] }),
    update: (id) => ({ sql: 'update public.set_logs set reps = 1 where id = $1', params: [id] }),
    delete: (id) => ({ sql: 'delete from public.set_logs where id = $1', params: [id] }),
  },
  {
    name: 'progression_suggestions',
    seed: async () => {
      const session = await asUser(
        db,
        userA,
        `insert into public.workout_sessions (user_id) values ($1) returning id`,
        [userA],
      );
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.progression_suggestions (user_id, exercise_id, source_workout_session_id, action, rationale)
         values ($1, $2, $3, 'hold', 'test rationale') returning id`,
        [userA, shared.exerciseId, session.rows[0].id],
      );
      return rows[0].id;
    },
    select: (id) => ({
      sql: 'select 1 from public.progression_suggestions where id = $1',
      params: [id],
    }),
    update: (id) => ({
      sql: "update public.progression_suggestions set status = 'accepted' where id = $1",
      params: [id],
    }),
    delete: (id) => ({
      sql: 'delete from public.progression_suggestions where id = $1',
      params: [id],
    }),
  },
  {
    name: 'weight_entries',
    seed: async () => {
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.weight_entries (user_id, weight_kg) values ($1, 80) returning id`,
        [userA],
      );
      return rows[0].id;
    },
    select: (id) => ({ sql: 'select 1 from public.weight_entries where id = $1', params: [id] }),
    update: (id) => ({
      sql: 'update public.weight_entries set weight_kg = 1 where id = $1',
      params: [id],
    }),
    delete: (id) => ({ sql: 'delete from public.weight_entries where id = $1', params: [id] }),
  },
  {
    name: 'nutrition_targets',
    seed: async () => {
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.nutrition_targets (user_id, daily_calories, protein_g, carbs_g, fat_g) values ($1, 2000, 150, 200, 60) returning id`,
        [userA],
      );
      return rows[0].id;
    },
    select: (id) => ({ sql: 'select 1 from public.nutrition_targets where id = $1', params: [id] }),
    update: (id) => ({
      sql: 'update public.nutrition_targets set daily_calories = 1 where id = $1',
      params: [id],
    }),
    delete: (id) => ({ sql: 'delete from public.nutrition_targets where id = $1', params: [id] }),
  },
  {
    name: 'food_log_entries',
    seed: async () => {
      const food = await asSuperuser(
        db,
        `insert into public.food_items (name, portion_description, calories_per_portion, protein_g_per_portion, carbs_g_per_portion, fat_g_per_portion, source)
         values ('Oats', '100g', 389, 16.9, 66, 6.9, 'external') returning id`,
      );
      const target = await asUser(
        db,
        userA,
        `insert into public.nutrition_targets (user_id, daily_calories, protein_g, carbs_g, fat_g) values ($1, 2000, 150, 200, 60) returning id`,
        [userA],
      );
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.food_log_entries (user_id, food_item_id, nutrition_target_id, meal_slot, portion_quantity, log_date)
         values ($1, $2, $3, 'breakfast', 1, current_date) returning id`,
        [userA, food.rows[0].id, target.rows[0].id],
      );
      return rows[0].id;
    },
    select: (id) => ({ sql: 'select 1 from public.food_log_entries where id = $1', params: [id] }),
    update: (id) => ({
      sql: 'update public.food_log_entries set portion_quantity = 2 where id = $1',
      params: [id],
    }),
    delete: (id) => ({ sql: 'delete from public.food_log_entries where id = $1', params: [id] }),
  },
  {
    name: 'personal_records',
    seed: async () => {
      const session = await asUser(
        db,
        userA,
        `insert into public.workout_sessions (user_id) values ($1) returning id`,
        [userA],
      );
      const setLog = await asUser(
        db,
        userA,
        `insert into public.set_logs (workout_session_id, user_id, exercise_id, set_index, weight_kg, reps)
         values ($1, $2, $3, 1, 100, 5) returning id`,
        [session.rows[0].id, userA, shared.exerciseId],
      );
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.personal_records (user_id, exercise_id, set_log_id, rep_count, weight_kg)
         values ($1, $2, $3, 5, 100) returning id`,
        [userA, shared.exerciseId, setLog.rows[0].id],
      );
      return rows[0].id;
    },
    select: (id) => ({ sql: 'select 1 from public.personal_records where id = $1', params: [id] }),
    update: (id) => ({
      sql: 'update public.personal_records set weight_kg = 1 where id = $1',
      params: [id],
    }),
    delete: (id) => ({ sql: 'delete from public.personal_records where id = $1', params: [id] }),
  },
  {
    name: 'schedule_adjustments',
    seed: async () => {
      const plan = await asUser(
        db,
        userA,
        `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id`,
        [userA],
      );
      const session = await asUser(
        db,
        userA,
        `insert into public.planned_sessions (workout_plan_id, user_id, day_order, name) values ($1, $2, 1, 'Day 1') returning id`,
        [plan.rows[0].id, userA],
      );
      const { rows } = await asUser(
        db,
        userA,
        `insert into public.schedule_adjustments (user_id, workout_plan_id, planned_session_id, week_start, action)
         values ($1, $2, $3, '2026-11-09', 'skip') returning id`,
        [userA, plan.rows[0].id, session.rows[0].id],
      );
      return rows[0].id;
    },
    select: (id) => ({ sql: 'select 1 from public.schedule_adjustments where id = $1', params: [id] }),
    update: null,
    delete: (id) => ({ sql: 'delete from public.schedule_adjustments where id = $1', params: [id] }),
  },
];

// ---------------------------------------------------------------------
// FR-2.5/OQ-5: profiles.training_weekdays and schedule_adjustments constraints
// ---------------------------------------------------------------------

describe('FR-2.5: profiles.training_weekdays', () => {
  test('accepts NULL or exactly training_days_per_week weekdays in 1..7', async () => {
    const userId = await seedUser(db, { trainingDaysPerWeek: 3 });
    await assert.doesNotReject(
      asUser(db, userId, 'update public.profiles set training_weekdays = $2 where user_id = $1', [userId, [1, 3, 5]]),
    );
    await assert.doesNotReject(
      asUser(db, userId, 'update public.profiles set training_weekdays = null where user_id = $1', [userId]),
    );
  });

  test('changing training_days_per_week clears stale weekdays instead of failing the profile save', async () => {
    const userId = await seedUser(db, { trainingDaysPerWeek: 3 });
    await asUser(db, userId, 'update public.profiles set training_weekdays = $2 where user_id = $1', [userId, [1, 3, 5]]);

    // Same day count (e.g. an unrelated profile edit): weekdays are kept.
    await asUser(db, userId, 'update public.profiles set training_days_per_week = 3, age = 31 where user_id = $1', [userId]);
    let { rows } = await asSuperuser(db, 'select training_weekdays from public.profiles where user_id = $1', [userId]);
    assert.deepEqual(rows[0].training_weekdays, [1, 3, 5]);

    // New day count without new weekdays: cleared, and the save succeeds.
    await asUser(db, userId, 'update public.profiles set training_days_per_week = 4 where user_id = $1', [userId]);
    ({ rows } = await asSuperuser(db, 'select training_weekdays from public.profiles where user_id = $1', [userId]));
    assert.equal(rows[0].training_weekdays, null);

    // New day count with matching new weekdays: kept.
    await asUser(db, userId, 'update public.profiles set training_days_per_week = 2, training_weekdays = $2 where user_id = $1', [userId, [2, 4]]);
    ({ rows } = await asSuperuser(db, 'select training_weekdays from public.profiles where user_id = $1', [userId]));
    assert.deepEqual(rows[0].training_weekdays, [2, 4]);
  });

  test('rejects a length that differs from training_days_per_week, and out-of-range weekdays', async () => {
    const userId = await seedUser(db, { trainingDaysPerWeek: 3 });
    await assert.rejects(
      asUser(db, userId, 'update public.profiles set training_weekdays = $2 where user_id = $1', [userId, [1, 3]]),
      /violates check constraint/i,
    );
    await assert.rejects(
      asUser(db, userId, 'update public.profiles set training_weekdays = $2 where user_id = $1', [userId, [0, 3, 5]]),
      /violates check constraint/i,
    );
    await assert.rejects(
      asUser(db, userId, 'update public.profiles set training_weekdays = $2 where user_id = $1', [userId, [1, 3, 8]]),
      /violates check constraint/i,
    );
  });
});

describe('FR-2.6/DR-6: schedule_adjustments constraints', () => {
  async function planAndSession(userId) {
    const plan = await asUser(db, userId, `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id`, [userId]);
    const session = await asUser(
      db,
      userId,
      `insert into public.planned_sessions (workout_plan_id, user_id, day_order, name) values ($1, $2, 1, 'Day 1') returning id`,
      [plan.rows[0].id, userId],
    );
    return { planId: plan.rows[0].id, sessionId: session.rows[0].id };
  }

  test('week_start must be a Monday, and a move needs a target date', async () => {
    const userId = await seedUser(db);
    const { planId, sessionId } = await planAndSession(userId);
    await assert.rejects(
      asUser(
        db,
        userId,
        `insert into public.schedule_adjustments (user_id, workout_plan_id, planned_session_id, week_start, action) values ($1, $2, $3, '2026-11-10', 'skip')`,
        [userId, planId, sessionId],
      ),
      /violates check constraint/i,
    );
    await assert.rejects(
      asUser(
        db,
        userId,
        `insert into public.schedule_adjustments (user_id, workout_plan_id, planned_session_id, week_start, action) values ($1, $2, $3, '2026-11-09', 'move')`,
        [userId, planId, sessionId],
      ),
      /violates check constraint/i,
    );
  });

  test('one choice per session per week', async () => {
    const userId = await seedUser(db);
    const { planId, sessionId } = await planAndSession(userId);
    const insert = () =>
      asUser(
        db,
        userId,
        `insert into public.schedule_adjustments (user_id, workout_plan_id, planned_session_id, week_start, action) values ($1, $2, $3, '2026-11-09', 'skip')`,
        [userId, planId, sessionId],
      );
    await insert();
    await assert.rejects(insert(), /duplicate key|unique/i);
  });

  test('a user cannot create an adjustment on behalf of someone else', async () => {
    const { planId, sessionId } = await planAndSession(userA);
    await assert.rejects(
      asUser(
        db,
        userB,
        `insert into public.schedule_adjustments (user_id, workout_plan_id, planned_session_id, week_start, action) values ($1, $2, $3, '2026-11-16', 'skip')`,
        [userA, planId, sessionId],
      ),
      /row-level security|permission denied/i,
    );
  });
});

describe('RLS: cross-user rejection on every user-scoped table', () => {
  for (const spec of specs) {
    test(`${spec.name}: user B cannot read, update, or delete user A's row`, async () => {
      const id = await seedRow(spec);

      // (a) read
      const sel = spec.select(id);
      const selRes = await asUser(db, userB, sel.sql, sel.params);
      assert.equal(selRes.rows.length, 0, `${spec.name}: user B should not see user A's row`);

      // (b) update
      if (spec.update) {
        const upd = spec.update(id);
        let updDenied = false;
        try {
          const res = await asUser(db, userB, upd.sql, upd.params);
          updDenied = res.affectedRows === 0 || res.rowCount === 0;
        } catch {
          updDenied = true;
        }
        assert.ok(updDenied, `${spec.name}: user B should not be able to update user A's row`);
      }

      // (c) delete
      const del = spec.delete(id);
      let delDenied = false;
      try {
        const res = await asUser(db, userB, del.sql, del.params);
        delDenied = res.affectedRows === 0 || res.rowCount === 0;
      } catch {
        delDenied = true;
      }
      assert.ok(delDenied, `${spec.name}: user B should not be able to delete user A's row`);

      // Sanity: the row must still exist and be intact for user A afterward.
      const stillThere = await asUser(db, userA, sel.sql, sel.params);
      assert.equal(
        stillThere.rows.length,
        1,
        `${spec.name}: user A's row must survive user B's attempts`,
      );
    });
  }
});

describe('RLS: food_items privacy (DR-2/A-7 — external shared, custom private)', () => {
  test('external food is readable by any authenticated user; custom food is not', async () => {
    const ext = await asSuperuser(
      db,
      `insert into public.food_items (name, portion_description, calories_per_portion, protein_g_per_portion, carbs_g_per_portion, fat_g_per_portion, source)
       values ('Banana', '1 medium', 105, 1.3, 27, 0.4, 'external') returning id`,
    );
    const custom = await asUser(
      db,
      userA,
      `insert into public.food_items (name, portion_description, calories_per_portion, protein_g_per_portion, carbs_g_per_portion, fat_g_per_portion, source, created_by_user_id)
       values ('Mom''s recipe', '1 bowl', 400, 20, 40, 15, 'user_created', $1) returning id`,
      [userA],
    );

    const extAsB = await asUser(db, userB, 'select 1 from public.food_items where id = $1', [
      ext.rows[0].id,
    ]);
    assert.equal(
      extAsB.rows.length,
      1,
      'external food should be visible to any authenticated user',
    );

    const customAsB = await asUser(db, userB, 'select 1 from public.food_items where id = $1', [
      custom.rows[0].id,
    ]);
    assert.equal(customAsB.rows.length, 0, "user B must not see user A's private custom food");

    let deleteDenied = false;
    try {
      const res = await asUser(db, userB, 'delete from public.food_items where id = $1', [
        custom.rows[0].id,
      ]);
      deleteDenied = res.affectedRows === 0;
    } catch {
      deleteDenied = true;
    }
    assert.ok(deleteDenied, "user B must not be able to delete user A's private custom food");
  });
});

// ---------------------------------------------------------------------
// (d) unauthenticated access rejected
// ---------------------------------------------------------------------

describe('RLS: unauthenticated (anon) access is rejected outright', () => {
  for (const spec of specs) {
    test(`${spec.name}: anon cannot read`, async () => {
      const sel = spec.select(userA);
      let rejected = false;
      try {
        const res = await asAnon(db, sel.sql, sel.params);
        rejected = res.rows.length === 0;
      } catch {
        rejected = true;
      }
      assert.ok(rejected, `${spec.name}: anon must not be able to read rows`);
    });
  }

  test('anon cannot insert a profile (no unauthenticated sign-up path at the DB layer)', async () => {
    await assert.rejects(
      asAnon(
        db,
        `insert into public.profiles (user_id, age, height_cm, weight_kg, biological_sex, fitness_level, goal, training_days_per_week)
         values ($1, 30, 180, 80, 'prefer_not_to_say', 'beginner', 'general_fitness', 3)`,
        [userA],
      ),
    );
  });
});

// ---------------------------------------------------------------------
// (e) service-role-only operations
// ---------------------------------------------------------------------

describe('RLS: service-role-only delete operations, verified individually per table', () => {
  // Every table below has NO delete policy for `authenticated` at all in
  // 0008_rls_policies.sql (DR-5 immutability for workout_plans /
  // planned_sessions / planned_session_exercises / nutrition_targets;
  // append-only history for personal_records; account-deletion-only for
  // profiles). Each case seeds its own fresh user so the two assertions
  // (denied to the owner, permitted to service_role) can't interfere with
  // any other test's fixtures.
  const cases = [
    {
      table: 'profiles',
      idColumn: 'user_id',
      seed: async () => {
        const user = await seedUser(db, { age: 50 });
        return { user, id: user };
      },
      del: (id) => ({ sql: 'delete from public.profiles where user_id = $1', params: [id] }),
    },
    {
      table: 'workout_plans',
      idColumn: 'id',
      seed: async () => {
        const user = await seedUser(db);
        const plan = await asUser(
          db,
          user,
          `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id`,
          [user],
        );
        return { user, id: plan.rows[0].id };
      },
      del: (id) => ({ sql: 'delete from public.workout_plans where id = $1', params: [id] }),
    },
    {
      table: 'planned_sessions',
      idColumn: 'id',
      seed: async () => {
        const user = await seedUser(db);
        const plan = await asUser(
          db,
          user,
          `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id`,
          [user],
        );
        const session = await asUser(
          db,
          user,
          `insert into public.planned_sessions (workout_plan_id, user_id, day_order, name) values ($1, $2, 1, 'Day 1') returning id`,
          [plan.rows[0].id, user],
        );
        return { user, id: session.rows[0].id };
      },
      del: (id) => ({ sql: 'delete from public.planned_sessions where id = $1', params: [id] }),
    },
    {
      table: 'planned_session_exercises',
      idColumn: 'id',
      seed: async () => {
        const user = await seedUser(db);
        const plan = await asUser(
          db,
          user,
          `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id`,
          [user],
        );
        const session = await asUser(
          db,
          user,
          `insert into public.planned_sessions (workout_plan_id, user_id, day_order, name) values ($1, $2, 1, 'Day 1') returning id`,
          [plan.rows[0].id, user],
        );
        const pse = await asUser(
          db,
          user,
          `insert into public.planned_session_exercises (planned_session_id, user_id, exercise_id, order_index, target_sets, target_reps_min)
           values ($1, $2, $3, 1, 3, 8) returning id`,
          [session.rows[0].id, user, shared.exerciseId],
        );
        return { user, id: pse.rows[0].id };
      },
      del: (id) => ({
        sql: 'delete from public.planned_session_exercises where id = $1',
        params: [id],
      }),
    },
    {
      table: 'personal_records',
      idColumn: 'id',
      seed: async () => {
        const user = await seedUser(db);
        const session = await asUser(
          db,
          user,
          `insert into public.workout_sessions (user_id) values ($1) returning id`,
          [user],
        );
        const setLog = await asUser(
          db,
          user,
          `insert into public.set_logs (workout_session_id, user_id, exercise_id, set_index, weight_kg, reps)
           values ($1, $2, $3, 1, 100, 5) returning id`,
          [session.rows[0].id, user, shared.exerciseId],
        );
        const pr = await asUser(
          db,
          user,
          `insert into public.personal_records (user_id, exercise_id, set_log_id, rep_count, weight_kg)
           values ($1, $2, $3, 5, 100) returning id`,
          [user, shared.exerciseId, setLog.rows[0].id],
        );
        return { user, id: pr.rows[0].id };
      },
      del: (id) => ({ sql: 'delete from public.personal_records where id = $1', params: [id] }),
    },
    {
      table: 'nutrition_targets',
      idColumn: 'id',
      seed: async () => {
        const user = await seedUser(db);
        const target = await asUser(
          db,
          user,
          `insert into public.nutrition_targets (user_id, daily_calories, protein_g, carbs_g, fat_g) values ($1, 2000, 150, 200, 60) returning id`,
          [user],
        );
        return { user, id: target.rows[0].id };
      },
      del: (id) => ({ sql: 'delete from public.nutrition_targets where id = $1', params: [id] }),
    },
  ];

  for (const c of cases) {
    test(`${c.table}: authenticated user cannot perform the protected delete; service_role can`, async () => {
      const { user, id } = await c.seed();
      const { sql, params } = c.del(id);

      let deniedToOwner = false;
      try {
        const res = await asUser(db, user, sql, params);
        deniedToOwner = res.affectedRows === 0;
      } catch {
        deniedToOwner = true;
      }
      assert.ok(
        deniedToOwner,
        `${c.table}: an authenticated user (including the row's own owner) must not be able to perform this delete`,
      );

      const svcRes = await asServiceRole(db, sql, params);
      assert.equal(
        svcRes.affectedRows,
        1,
        `${c.table}: service_role must be able to perform this delete (account deletion / DR-5 purge)`,
      );

      const gone = await asSuperuser(
        db,
        `select 1 from public.${c.table} where ${c.idColumn} = $1`,
        [id],
      );
      assert.equal(
        gone.rows.length,
        0,
        `${c.table}: row must actually be gone after the service_role delete`,
      );
    });
  }
});

// ---------------------------------------------------------------------
// DR-5: versioning, immutability, and historical attribution
// ---------------------------------------------------------------------

describe('DR-5: plan/target versioning', () => {
  test('regenerating a workout plan creates a new version and supersedes the prior one without mutating or deleting it', async () => {
    const user = await seedUser(db);

    const v1 = await asUser(
      db,
      user,
      `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id, plan_version, superseded_at`,
      [user],
    );
    assert.equal(v1.rows[0].plan_version, 1);
    assert.equal(v1.rows[0].superseded_at, null);

    const v2 = await asUser(
      db,
      user,
      `insert into public.workout_plans (user_id, split_type) values ($1, 'upper_lower') returning id, plan_version, superseded_at`,
      [user],
    );
    assert.equal(v2.rows[0].plan_version, 2);
    assert.equal(v2.rows[0].superseded_at, null);

    const v1After = await asUser(
      db,
      user,
      'select split_type, superseded_at from public.workout_plans where id = $1',
      [v1.rows[0].id],
    );
    assert.equal(v1After.rows[0].split_type, 'full_body', 'v1 must not be mutated by regeneration');
    assert.notEqual(
      v1After.rows[0].superseded_at,
      null,
      'v1 must be marked superseded automatically',
    );

    // Direct mutation of a superseded version is rejected.
    await assert.rejects(
      asUser(
        db,
        user,
        "update public.workout_plans set split_type = 'push_pull_legs' where id = $1",
        [v1.rows[0].id],
      ),
      /superseded|immutable/i,
    );

    // Direct mutation of the still-current version is also rejected —
    // only the superseded_at transition itself is ever permitted.
    await assert.rejects(
      asUser(
        db,
        user,
        "update public.workout_plans set split_type = 'push_pull_legs' where id = $1",
        [v2.rows[0].id],
      ),
      /immutable/i,
    );
  });

  test("a Set Log created against plan version N still resolves to version N's prescription after regeneration creates version N+1", async () => {
    const user = await seedUser(db);

    const planV1 = await asUser(
      db,
      user,
      `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id`,
      [user],
    );
    const sessionV1 = await asUser(
      db,
      user,
      `insert into public.planned_sessions (workout_plan_id, user_id, day_order, name) values ($1, $2, 1, 'Day 1') returning id`,
      [planV1.rows[0].id, user],
    );
    await asUser(
      db,
      user,
      `insert into public.planned_session_exercises (planned_session_id, user_id, exercise_id, order_index, target_sets, target_reps_min)
       values ($1, $2, $3, 1, 3, 8)`,
      [sessionV1.rows[0].id, user, shared.exerciseId],
    );

    const workoutSession = await asUser(
      db,
      user,
      `insert into public.workout_sessions (user_id, planned_session_id) values ($1, $2) returning id, workout_plan_id`,
      [user, sessionV1.rows[0].id],
    );
    assert.equal(
      workoutSession.rows[0].workout_plan_id,
      planV1.rows[0].id,
      'workout_plan_id should be auto-derived from planned_session_id',
    );

    const setLog = await asUser(
      db,
      user,
      `insert into public.set_logs (workout_session_id, user_id, exercise_id, set_index, weight_kg, reps)
       values ($1, $2, $3, 1, 40, 8) returning id`,
      [workoutSession.rows[0].id, user, shared.exerciseId],
    );

    // Regenerate: new plan version with a different prescription.
    const planV2 = await asUser(
      db,
      user,
      `insert into public.workout_plans (user_id, split_type) values ($1, 'upper_lower') returning id`,
      [user],
    );
    const sessionV2 = await asUser(
      db,
      user,
      `insert into public.planned_sessions (workout_plan_id, user_id, day_order, name) values ($1, $2, 1, 'Day 1') returning id`,
      [planV2.rows[0].id, user],
    );
    await asUser(
      db,
      user,
      `insert into public.planned_session_exercises (planned_session_id, user_id, exercise_id, order_index, target_sets, target_reps_min)
       values ($1, $2, $3, 1, 3, 10)`,
      [sessionV2.rows[0].id, user, shared.exerciseId],
    );

    // The historical set log's session must still resolve to v1's prescription (reps_min = 8), not v2's (10).
    const resolved = await asUser(
      db,
      user,
      `select pse.target_reps_min
       from public.set_logs sl
       join public.workout_sessions ws on ws.id = sl.workout_session_id
       join public.planned_sessions ps on ps.id = ws.planned_session_id
       join public.planned_session_exercises pse on pse.planned_session_id = ps.id and pse.exercise_id = sl.exercise_id
       where sl.id = $1`,
      [setLog.rows[0].id],
    );
    assert.equal(
      resolved.rows[0].target_reps_min,
      8,
      'historical set log must resolve to the plan version active when it was logged, not a later regeneration',
    );

    const planIdOfSession = await asUser(
      db,
      user,
      'select workout_plan_id from public.workout_sessions where id = $1',
      [workoutSession.rows[0].id],
    );
    assert.equal(
      planIdOfSession.rows[0].workout_plan_id,
      planV1.rows[0].id,
      'workout_session must still point at plan v1 after v2 exists',
    );
  });

  test('a Food Log Entry stays attributed to the nutrition target version active when it was logged', async () => {
    const user = await seedUser(db);
    const food = await asSuperuser(
      db,
      `insert into public.food_items (name, portion_description, calories_per_portion, protein_g_per_portion, carbs_g_per_portion, fat_g_per_portion, source)
       values ('Rice', '100g', 130, 2.7, 28, 0.3, 'external') returning id`,
    );

    const targetV1 = await asUser(
      db,
      user,
      `insert into public.nutrition_targets (user_id, daily_calories, protein_g, carbs_g, fat_g) values ($1, 2000, 150, 200, 60) returning id`,
      [user],
    );
    const entry = await asUser(
      db,
      user,
      `insert into public.food_log_entries (user_id, food_item_id, nutrition_target_id, meal_slot, portion_quantity, log_date)
       values ($1, $2, $3, 'lunch', 1, current_date) returning id`,
      [user, food.rows[0].id, targetV1.rows[0].id],
    );

    // Regenerate targets.
    await asUser(
      db,
      user,
      `insert into public.nutrition_targets (user_id, daily_calories, protein_g, carbs_g, fat_g) values ($1, 1800, 140, 180, 55) returning id`,
      [user],
    );

    const attribution = await asUser(
      db,
      user,
      'select nutrition_target_id from public.food_log_entries where id = $1',
      [entry.rows[0].id],
    );
    assert.equal(
      attribution.rows[0].nutrition_target_id,
      targetV1.rows[0].id,
      'food log entry must remain attributed to the target version active when it was logged',
    );

    const v1Row = await asUser(
      db,
      user,
      'select daily_calories, superseded_at from public.nutrition_targets where id = $1',
      [targetV1.rows[0].id],
    );
    assert.equal(
      v1Row.rows[0].daily_calories,
      2000,
      'superseded target values must not be mutated',
    );
    assert.notEqual(v1Row.rows[0].superseded_at, null);
  });
});

// ---------------------------------------------------------------------
// Phase 12 / AC-13: account-deletion completeness
// ---------------------------------------------------------------------

describe('AC-13: account deletion leaves zero residual rows across every user-scoped table', () => {
  test('deleting auth.users (the delete-account edge function\'s own operation) cascades through every table, including superseded plan/target versions', async () => {
    const user = await seedUser(db);

    await asServiceRole(
      db,
      `insert into public.user_equipment (user_id, equipment_item_id) values ($1, $2)`,
      [user, shared.equipmentItemId],
    );

    // Workout plan: v1 then v2, so v1 ends up superseded (DR-5 history).
    const planV1 = await asUser(
      db,
      user,
      `insert into public.workout_plans (user_id, split_type) values ($1, 'full_body') returning id`,
      [user],
    );
    const sessionV1 = await asUser(
      db,
      user,
      `insert into public.planned_sessions (workout_plan_id, user_id, day_order, name) values ($1, $2, 1, 'Day 1') returning id`,
      [planV1.rows[0].id, user],
    );
    await asUser(
      db,
      user,
      `insert into public.planned_session_exercises (planned_session_id, user_id, exercise_id, order_index, target_sets, target_reps_min)
       values ($1, $2, $3, 1, 3, 8)`,
      [sessionV1.rows[0].id, user, shared.exerciseId],
    );
    const workoutSession = await asUser(
      db,
      user,
      `insert into public.workout_sessions (user_id, planned_session_id) values ($1, $2) returning id`,
      [user, sessionV1.rows[0].id],
    );
    const setLog = await asUser(
      db,
      user,
      `insert into public.set_logs (workout_session_id, user_id, exercise_id, set_index, weight_kg, reps)
       values ($1, $2, $3, 1, 100, 5) returning id`,
      [workoutSession.rows[0].id, user, shared.exerciseId],
    );
    await asUser(
      db,
      user,
      `insert into public.progression_suggestions (user_id, exercise_id, source_workout_session_id, action, suggested_weight_kg, suggested_reps, rationale)
       values ($1, $2, $3, 'increase_weight', 102.5, 5, 'Full prescription met')`,
      [user, shared.exerciseId, workoutSession.rows[0].id],
    );
    await asUser(
      db,
      user,
      `insert into public.personal_records (user_id, exercise_id, set_log_id, rep_count, weight_kg)
       values ($1, $2, $3, 5, 100)`,
      [user, shared.exerciseId, setLog.rows[0].id],
    );
    // Superseding regeneration — v1 must still be present (as superseded) right up until deletion.
    await asUser(
      db,
      user,
      `insert into public.workout_plans (user_id, split_type) values ($1, 'upper_lower') returning id`,
      [user],
    );

    await asUser(
      db,
      user,
      `insert into public.weight_entries (user_id, weight_kg, measured_at) values ($1, 80, current_date)`,
      [user],
    );

    // Nutrition: target v1 then v2 (v1 superseded), plus a user-created private food item.
    const targetV1 = await asUser(
      db,
      user,
      `insert into public.nutrition_targets (user_id, daily_calories, protein_g, carbs_g, fat_g) values ($1, 2000, 150, 200, 60) returning id`,
      [user],
    );
    const customFood = await asUser(
      db,
      user,
      `insert into public.food_items (name, portion_description, calories_per_portion, protein_g_per_portion, carbs_g_per_portion, fat_g_per_portion, source, created_by_user_id)
       values ('My Protein Shake', '1 scoop', 120, 25, 3, 1, 'user_created', $1) returning id`,
      [user],
    );
    await asUser(
      db,
      user,
      `insert into public.food_log_entries (user_id, food_item_id, nutrition_target_id, meal_slot, portion_quantity, log_date)
       values ($1, $2, $3, 'breakfast', 1, current_date)`,
      [user, customFood.rows[0].id, targetV1.rows[0].id],
    );
    await asUser(
      db,
      user,
      `insert into public.nutrition_targets (user_id, daily_calories, protein_g, carbs_g, fat_g) values ($1, 1800, 140, 180, 55) returning id`,
      [user],
    );

    // Sanity check: every table actually has at least one row for this user before deletion.
    const tablesWithUserId = [
      'profiles',
      'user_equipment',
      'workout_plans',
      'planned_sessions',
      'planned_session_exercises',
      'workout_sessions',
      'set_logs',
      'progression_suggestions',
      'personal_records',
      'weight_entries',
      'nutrition_targets',
      'food_log_entries',
    ];
    for (const table of tablesWithUserId) {
      const idCol = table === 'profiles' ? 'user_id' : 'user_id';
      const { rows } = await asSuperuser(db, `select 1 from public.${table} where ${idCol} = $1`, [
        user,
      ]);
      assert.ok(rows.length > 0, `expected at least one ${table} row for the user before deletion`);
    }
    const customFoodBefore = await asSuperuser(
      db,
      'select 1 from public.food_items where created_by_user_id = $1',
      [user],
    );
    assert.equal(customFoodBefore.rows.length, 1);

    // This is the one operation the delete-account edge function actually performs
    // (supabase.auth.admin.deleteUser) — everything else is cascade, per the FK graph
    // established across migrations 0001-0009.
    const del = await asServiceRole(db, 'delete from auth.users where id = $1', [user]);
    assert.equal(del.affectedRows, 1);

    for (const table of tablesWithUserId) {
      const { rows } = await asSuperuser(db, `select 1 from public.${table} where user_id = $1`, [
        user,
      ]);
      assert.equal(rows.length, 0, `${table}: residual row found after account deletion`);
    }
    const customFoodAfter = await asSuperuser(
      db,
      'select 1 from public.food_items where created_by_user_id = $1',
      [user],
    );
    assert.equal(
      customFoodAfter.rows.length,
      0,
      'user-created private food item must not survive account deletion',
    );
  });
});
