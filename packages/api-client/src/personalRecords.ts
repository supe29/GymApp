import type { NewPersonalRecord } from 'core';

import type { GymSupabaseClient } from './client';
import type { ApiResult } from './profile';
import type { Database } from './types/database';

export type PersonalRecordRow = Database['public']['Tables']['personal_records']['Row'];

export interface PersistedPersonalRecord {
  id: string;
  exerciseId: string;
  setLogId: string;
  repCount: number;
  weightKg: number;
  estimatedOneRm: number | null;
  achievedAt: string;
}

export interface PersonalRecordWithExerciseName extends PersistedPersonalRecord {
  exerciseName: string;
}

function toPersisted(row: PersonalRecordRow): PersistedPersonalRecord {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    setLogId: row.set_log_id,
    repCount: row.rep_count,
    weightKg: row.weight_kg,
    estimatedOneRm: row.estimated_one_rm,
    achievedAt: row.achieved_at,
  };
}

/**
 * FR-8.2: persists one newly-derived PR. `personal_records` is append-only
 * at the RLS level (select/insert only, no update/delete grant for
 * `authenticated`) — this module intentionally never defines an
 * update/delete function, matching that grant exactly.
 */
export async function createPersonalRecord(
  client: GymSupabaseClient,
  userId: string,
  input: NewPersonalRecord,
): Promise<ApiResult<PersistedPersonalRecord>> {
  const { data, error } = await client
    .from('personal_records')
    .insert({
      user_id: userId,
      exercise_id: input.exerciseId,
      set_log_id: input.setLogId,
      rep_count: input.repCount,
      weight_kg: input.weightKg,
      estimated_one_rm: input.estimatedOneRm,
    })
    .select()
    .single();
  if (error || !data) {
    return { data: null, error: error ? error.message : 'Failed to save personal record.' };
  }
  return { data: toPersisted(data), error: null };
}

/**
 * FR-8.2: the user's full, append-only PR history joined with exercise
 * names — flat queries + a client-side `Map` join, matching
 * `workoutSessions.ts`'s `getWorkoutSessionHistory` convention (the
 * hand-authored `Database` type declares `Relationships: never[]` for
 * every table). Reduce the result via `core`'s `currentPersonalRecordsByBucket`
 * for "the" current record per bucket.
 */
export async function getPersonalRecordsForUser(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<PersonalRecordWithExerciseName[]>> {
  const { data, error } = await client.from('personal_records').select('*').eq('user_id', userId);
  if (error) {
    return { data: null, error: error.message };
  }
  const records = (data ?? []).map(toPersisted);
  const exerciseIds = [...new Set(records.map((r) => r.exerciseId))];
  if (exerciseIds.length === 0) {
    return { data: [], error: null };
  }

  const { data: exerciseRows, error: exerciseError } = await client
    .from('exercises')
    .select('id, name')
    .in('id', exerciseIds);
  if (exerciseError) {
    return { data: null, error: exerciseError.message };
  }
  const nameById = new Map((exerciseRows ?? []).map((row) => [row.id, row.name]));

  return {
    data: records.map((record) => ({ ...record, exerciseName: nameById.get(record.exerciseId) ?? record.exerciseId })),
    error: null,
  };
}
