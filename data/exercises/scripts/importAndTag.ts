// Phase 3: import the vendored exercise dataset (licensed and vendored per
// /docs/licensing/exercise-dataset-license.md) and re-tag it onto this
// app's own muscle/equipment/difficulty taxonomy (DR-1), producing
// /supabase/seed/exercises_seed.sql.
//
// Run with: npm run content:import-exercises
//
// Idempotent by design: every id is a deterministic UUID v5 derived from a
// stable source key (not random), and the generated SQL uses
// `ON CONFLICT ... DO UPDATE` for taxonomy/exercise rows and a delete-then-
// insert for the exercise_muscles/exercise_equipment junction tables. Ie.
// re-running this script after the upstream dataset or the mapping files
// change produces corrected data, not duplicates (NFR-6: content must be
// correctable without a full app release).

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { v5 as uuidv5 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Fixed, arbitrary namespace for this project's deterministic content IDs.
// Never change this — changing it would silently re-key every seeded row.
const NAMESPACE = '8f14e45f-ceea-467e-bd9b-0c34f9e58c41';

function deterministicId(key: string): string {
  return uuidv5(key, NAMESPACE);
}

interface SourceExercise {
  id: string;
  name: string;
  force: string | null;
  level: 'beginner' | 'intermediate' | 'expert';
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
}

interface MuscleTaxonomy {
  groups: { key: string; displayName: string }[];
  sourceValueToKey: Record<string, string>;
}

interface EquipmentTaxonomy {
  items: { key: string; displayName: string; category: string }[];
  sourceValueToKey: Record<string, string>;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function mapDifficulty(level: SourceExercise['level']): 'beginner' | 'intermediate' | 'advanced' {
  return level === 'expert' ? 'advanced' : level;
}

function main() {
  const sourceExercises: SourceExercise[] = JSON.parse(
    readFileSync(path.join(DATA_DIR, 'source/exercises.json'), 'utf8'),
  );
  const muscleTaxonomy: MuscleTaxonomy = JSON.parse(
    readFileSync(path.join(DATA_DIR, 'mapping/muscleTaxonomy.json'), 'utf8'),
  );
  const equipmentTaxonomy: EquipmentTaxonomy = JSON.parse(
    readFileSync(path.join(DATA_DIR, 'mapping/equipmentTaxonomy.json'), 'utf8'),
  );

  const muscleGroupIdByKey = new Map(
    muscleTaxonomy.groups.map((g) => [g.key, deterministicId(`muscle_group:${g.key}`)]),
  );
  const equipmentItemIdByKey = new Map(
    equipmentTaxonomy.items.map((i) => [i.key, deterministicId(`equipment_item:${i.key}`)]),
  );

  const unmappedMuscles = new Set<string>();
  const unmappedEquipment = new Set<string>();

  const exerciseRows: { id: string; name: string; instructions: string; difficulty: string }[] = [];
  const exerciseMuscleRows: { exerciseId: string; muscleGroupId: string; role: string }[] = [];
  const exerciseEquipmentRows: { exerciseId: string; equipmentItemId: string }[] = [];

  for (const src of sourceExercises) {
    const exerciseId = deterministicId(`exercise:${src.id}`);
    exerciseRows.push({
      id: exerciseId,
      name: src.name,
      instructions: src.instructions.join('\n'),
      difficulty: mapDifficulty(src.level),
    });

    // Data-quality curation: a handful of upstream exercises (e.g.
    // "Bent-Arm Barbell Pullover") list the same muscle in both
    // primaryMuscles and secondaryMuscles, which the source schema allows
    // but ours doesn't — exercise_muscles' primary key is
    // (exercise_id, muscle_group_id), one row per muscle per exercise, since
    // "primary and secondary at once" isn't a meaningful distinct fact.
    // Resolution: primary wins; a muscle already recorded as primary is not
    // re-added as secondary.
    const roleByMuscleKey = new Map<string, 'primary' | 'secondary'>();

    for (const muscle of src.primaryMuscles) {
      const key = muscleTaxonomy.sourceValueToKey[muscle];
      if (!key || !muscleGroupIdByKey.has(key)) {
        unmappedMuscles.add(muscle);
        continue;
      }
      roleByMuscleKey.set(key, 'primary');
    }
    for (const muscle of src.secondaryMuscles) {
      const key = muscleTaxonomy.sourceValueToKey[muscle];
      if (!key || !muscleGroupIdByKey.has(key)) {
        unmappedMuscles.add(muscle);
        continue;
      }
      if (!roleByMuscleKey.has(key)) {
        roleByMuscleKey.set(key, 'secondary');
      }
    }
    for (const [key, role] of roleByMuscleKey) {
      exerciseMuscleRows.push({
        exerciseId,
        muscleGroupId: muscleGroupIdByKey.get(key)!,
        role,
      });
    }

    if (src.equipment !== null) {
      const key = equipmentTaxonomy.sourceValueToKey[src.equipment];
      if (!key || !equipmentItemIdByKey.has(key)) {
        unmappedEquipment.add(src.equipment);
      } else {
        exerciseEquipmentRows.push({
          exerciseId,
          equipmentItemId: equipmentItemIdByKey.get(key)!,
        });
      }
    }
  }

  if (unmappedMuscles.size > 0) {
    throw new Error(
      `Unmapped muscle source values (update muscleTaxonomy.json): ${[...unmappedMuscles].join(', ')}`,
    );
  }
  if (unmappedEquipment.size > 0) {
    throw new Error(
      `Unmapped equipment source values (update equipmentTaxonomy.json): ${[...unmappedEquipment].join(', ')}`,
    );
  }

  const exerciseIds = exerciseRows.map((r) => r.id);

  const lines: string[] = [];
  lines.push('-- GENERATED FILE — do not hand-edit.');
  lines.push(
    '-- Produced by data/exercises/scripts/importAndTag.ts (npm run content:import-exercises).',
  );
  lines.push(
    `-- Source: /data/exercises/source/exercises.json (${sourceExercises.length} exercises),`,
  );
  lines.push(
    '-- licensed per /docs/licensing/exercise-dataset-license.md (Unlicense / public domain).',
  );
  lines.push('-- Safe to re-run: all ids are deterministic (uuid v5), and this script');
  lines.push("-- upserts taxonomy/exercise rows and replaces each exercise's tag rows.");
  lines.push('');
  lines.push('begin;');
  lines.push('');

  lines.push('-- Muscle taxonomy (spec.md A-4, resolves OQ-2)');
  lines.push('insert into public.muscle_groups (id, key, display_name) values');
  lines.push(
    muscleTaxonomy.groups
      .map(
        (g, i) =>
          `  (${sqlString(muscleGroupIdByKey.get(g.key)!)}, ${sqlString(g.key)}, ${sqlString(g.displayName)})${i === muscleTaxonomy.groups.length - 1 ? '' : ','}`,
      )
      .join('\n'),
  );
  lines.push('on conflict (key) do update set display_name = excluded.display_name;');
  lines.push('');

  lines.push('-- Equipment taxonomy (FR-1.2)');
  lines.push('insert into public.equipment_items (id, key, display_name, category) values');
  lines.push(
    equipmentTaxonomy.items
      .map(
        (it, i) =>
          `  (${sqlString(equipmentItemIdByKey.get(it.key)!)}, ${sqlString(it.key)}, ${sqlString(it.displayName)}, ${sqlString(it.category)})${i === equipmentTaxonomy.items.length - 1 ? '' : ','}`,
      )
      .join('\n'),
  );
  lines.push(
    'on conflict (key) do update set display_name = excluded.display_name, category = excluded.category;',
  );
  lines.push('');

  lines.push(`-- Exercises (${exerciseRows.length} rows)`);
  lines.push('insert into public.exercises (id, name, instructions, difficulty) values');
  lines.push(
    exerciseRows
      .map(
        (r, i) =>
          `  (${sqlString(r.id)}, ${sqlString(r.name)}, ${sqlString(r.instructions)}, ${sqlString(r.difficulty)})${i === exerciseRows.length - 1 ? '' : ','}`,
      )
      .join('\n'),
  );
  lines.push(
    'on conflict (id) do update set name = excluded.name, instructions = excluded.instructions, difficulty = excluded.difficulty;',
  );
  lines.push('');

  lines.push('-- Replace tag rows for every seeded exercise (idempotent re-tagging)');
  lines.push(
    `delete from public.exercise_muscles where exercise_id in (${exerciseIds.map(sqlString).join(', ')});`,
  );
  lines.push(
    `delete from public.exercise_equipment where exercise_id in (${exerciseIds.map(sqlString).join(', ')});`,
  );
  lines.push('');

  lines.push(`-- Exercise -> muscle group tags (${exerciseMuscleRows.length} rows)`);
  lines.push('insert into public.exercise_muscles (exercise_id, muscle_group_id, role) values');
  lines.push(
    exerciseMuscleRows
      .map(
        (r, i) =>
          `  (${sqlString(r.exerciseId)}, ${sqlString(r.muscleGroupId)}, ${sqlString(r.role)})${i === exerciseMuscleRows.length - 1 ? '' : ','}`,
      )
      .join('\n'),
  );
  lines.push(';');
  lines.push('');

  lines.push(`-- Exercise -> required equipment (${exerciseEquipmentRows.length} rows)`);
  lines.push('insert into public.exercise_equipment (exercise_id, equipment_item_id) values');
  lines.push(
    exerciseEquipmentRows
      .map(
        (r, i) =>
          `  (${sqlString(r.exerciseId)}, ${sqlString(r.equipmentItemId)})${i === exerciseEquipmentRows.length - 1 ? '' : ','}`,
      )
      .join('\n'),
  );
  lines.push(';');
  lines.push('');
  lines.push('commit;');
  lines.push('');

  const outPath = path.join(REPO_ROOT, 'supabase/seed/exercises_seed.sql');
  writeFileSync(outPath, lines.join('\n'), 'utf8');

  console.log(`Wrote ${outPath}`);
  console.log(`  muscle groups: ${muscleTaxonomy.groups.length}`);
  console.log(`  equipment items: ${equipmentTaxonomy.items.length}`);
  console.log(`  exercises: ${exerciseRows.length}`);
  console.log(`  exercise_muscles rows: ${exerciseMuscleRows.length}`);
  console.log(`  exercise_equipment rows: ${exerciseEquipmentRows.length}`);
}

main();
