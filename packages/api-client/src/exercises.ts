import type { Difficulty, ExerciseWithTags } from 'core';

import type { GymSupabaseClient } from './client';
import type { ApiResult } from './profile';
import type { Database } from './types/database';

export type MuscleGroupRow = Database['public']['Tables']['muscle_groups']['Row'];

/**
 * FR-4.2/FR-2.2: fetches every exercise with its muscle and equipment tags
 * assembled into the shape packages/core's filter helpers
 * (filterByMuscleGroup, filterByEquipmentSubset, filterByDifficulty)
 * expect. Deliberately assembled with flat, separate queries and joined in
 * JS rather than a single PostgREST embedded-resource query — this
 * package's hand-authored Database type (see ./types/database.ts) declares
 * `Relationships: never[]` for every table (see the Phase 2 report on why),
 * which does not support typed embedded-select parsing; flat queries stay
 * correctly typed against the Row types we do have.
 */
export async function getExercisesWithTags(
  client: GymSupabaseClient,
): Promise<ApiResult<ExerciseWithTags[]>> {
  const [exercisesRes, exerciseMusclesRes, muscleGroupsRes, exerciseEquipmentRes, equipmentItemsRes] =
    await Promise.all([
      // `*` rather than a column list so this still works against a
      // database that hasn't applied migration 0010 (category/mechanic)
      // yet — those fields then come back undefined and map to null.
      client.from('exercises').select('*'),
      client.from('exercise_muscles').select('exercise_id, muscle_group_id, role'),
      client.from('muscle_groups').select('id, key'),
      client.from('exercise_equipment').select('exercise_id, equipment_item_id'),
      client.from('equipment_items').select('id, key'),
    ]);

  const firstError =
    exercisesRes.error ??
    exerciseMusclesRes.error ??
    muscleGroupsRes.error ??
    exerciseEquipmentRes.error ??
    equipmentItemsRes.error;
  if (firstError) {
    return { data: null, error: firstError.message };
  }

  const muscleGroupKeyById = new Map((muscleGroupsRes.data ?? []).map((m) => [m.id, m.key]));
  const equipmentItemKeyById = new Map((equipmentItemsRes.data ?? []).map((e) => [e.id, e.key]));

  const primaryMusclesByExercise = new Map<string, string[]>();
  const secondaryMusclesByExercise = new Map<string, string[]>();
  for (const row of exerciseMusclesRes.data ?? []) {
    const key = muscleGroupKeyById.get(row.muscle_group_id);
    if (!key) continue;
    const map = row.role === 'primary' ? primaryMusclesByExercise : secondaryMusclesByExercise;
    const list = map.get(row.exercise_id) ?? [];
    list.push(key);
    map.set(row.exercise_id, list);
  }

  const equipmentByExercise = new Map<string, string[]>();
  for (const row of exerciseEquipmentRes.data ?? []) {
    const key = equipmentItemKeyById.get(row.equipment_item_id);
    if (!key) continue;
    const list = equipmentByExercise.get(row.exercise_id) ?? [];
    list.push(key);
    equipmentByExercise.set(row.exercise_id, list);
  }

  const exercises: ExerciseWithTags[] = (exercisesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    difficulty: row.difficulty as Difficulty,
    primaryMuscleKeys: primaryMusclesByExercise.get(row.id) ?? [],
    secondaryMuscleKeys: secondaryMusclesByExercise.get(row.id) ?? [],
    requiredEquipmentKeys: equipmentByExercise.get(row.id) ?? [],
    category: row.category ?? null,
    mechanic: row.mechanic ?? null,
  }));

  return { data: exercises, error: null };
}

/** FR-4.1: the fixed muscle-group taxonomy, for rendering the fallback list (NFR-5) and region labels. */
export async function listMuscleGroups(
  client: GymSupabaseClient,
): Promise<ApiResult<MuscleGroupRow[]>> {
  const { data, error } = await client.from('muscle_groups').select('*').order('display_name');
  return { data: data ?? [], error: error ? error.message : null };
}

export interface ExerciseMuscleKeys {
  primary: string[];
  secondary: string[];
}

/**
 * FR-4.2: primary/secondary muscle-group keys for just the given
 * exercises, for lighting up the demo figure on the plan and session
 * screens without loading the whole exercise dataset. Exercises with no
 * muscle rows are absent from the map.
 */
export async function getMuscleKeysForExercises(
  client: GymSupabaseClient,
  exerciseIds: string[],
): Promise<ApiResult<Map<string, ExerciseMuscleKeys>>> {
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) {
    return { data: new Map(), error: null };
  }

  const [exerciseMusclesRes, muscleGroupsRes] = await Promise.all([
    client.from('exercise_muscles').select('exercise_id, muscle_group_id, role').in('exercise_id', ids),
    client.from('muscle_groups').select('id, key'),
  ]);
  const firstError = exerciseMusclesRes.error ?? muscleGroupsRes.error;
  if (firstError) {
    return { data: null, error: firstError.message };
  }

  const muscleGroupKeyById = new Map((muscleGroupsRes.data ?? []).map((m) => [m.id, m.key]));
  const byExercise = new Map<string, ExerciseMuscleKeys>();
  for (const row of exerciseMusclesRes.data ?? []) {
    const key = muscleGroupKeyById.get(row.muscle_group_id);
    if (!key) continue;
    const entry = byExercise.get(row.exercise_id) ?? { primary: [], secondary: [] };
    (row.role === 'primary' ? entry.primary : entry.secondary).push(key);
    byExercise.set(row.exercise_id, entry);
  }
  return { data: byExercise, error: null };
}
