import { effectiveSuggestionValue, type EffectiveSuggestionValue } from 'core';

import type { GymSupabaseClient } from './client';
import type { ApiResult } from './profile';
import type { Database } from './types/database';

export type ProgressionSuggestionRow = Database['public']['Tables']['progression_suggestions']['Row'];

export interface PersistedProgressionSuggestion {
  id: string;
  exerciseId: string;
  sourceWorkoutSessionId: string;
  action: ProgressionSuggestionRow['action'];
  suggestedWeightKg: number | null;
  suggestedReps: number | null;
  rationale: string;
  status: ProgressionSuggestionRow['status'];
  overriddenWeightKg: number | null;
  overriddenReps: number | null;
}

export interface CreateProgressionSuggestionInput {
  exerciseId: string;
  sourceWorkoutSessionId: string;
  action: ProgressionSuggestionRow['action'];
  suggestedWeightKg: number | null;
  suggestedReps: number | null;
  rationale: string;
}

export interface UpdateProgressionSuggestionStatusInput {
  status: 'accepted' | 'declined' | 'overridden';
  overriddenWeightKg?: number | null;
  overriddenReps?: number | null;
}

function result<T>(data: T | null, error: { message: string } | null): ApiResult<T> {
  return { data, error: error ? error.message : null };
}

function toPersisted(row: ProgressionSuggestionRow): PersistedProgressionSuggestion {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    sourceWorkoutSessionId: row.source_workout_session_id,
    action: row.action,
    suggestedWeightKg: row.suggested_weight_kg,
    suggestedReps: row.suggested_reps,
    rationale: row.rationale,
    status: row.status,
    overriddenWeightKg: row.overridden_weight_kg,
    overriddenReps: row.overridden_reps,
  };
}

/** FR-6.1: persists a progression suggestion produced by core's evaluateExercisePerformance. status is omitted — the DB defaults it to 'pending'. */
export async function createProgressionSuggestion(
  client: GymSupabaseClient,
  userId: string,
  input: CreateProgressionSuggestionInput,
): Promise<ApiResult<PersistedProgressionSuggestion>> {
  const { data, error } = await client
    .from('progression_suggestions')
    .insert({
      user_id: userId,
      exercise_id: input.exerciseId,
      source_workout_session_id: input.sourceWorkoutSessionId,
      action: input.action,
      suggested_weight_kg: input.suggestedWeightKg,
      suggested_reps: input.suggestedReps,
      rationale: input.rationale,
      overridden_weight_kg: null,
      overridden_reps: null,
    })
    .select()
    .single();
  if (error || !data) {
    return result<PersistedProgressionSuggestion>(null, error ?? { message: 'Failed to create progression suggestion.' });
  }
  return { data: toPersisted(data), error: null };
}

/** FR-6.2: accept, decline, or override a suggestion — the only mutable fields post-insert (status/overridden_*), matching the Update type exactly. */
export async function updateProgressionSuggestionStatus(
  client: GymSupabaseClient,
  userId: string,
  suggestionId: string,
  patch: UpdateProgressionSuggestionStatusInput,
): Promise<ApiResult<PersistedProgressionSuggestion>> {
  const updatePayload: {
    status: ProgressionSuggestionRow['status'];
    overridden_weight_kg?: number | null;
    overridden_reps?: number | null;
  } = { status: patch.status };
  if (patch.overriddenWeightKg !== undefined) updatePayload.overridden_weight_kg = patch.overriddenWeightKg;
  if (patch.overriddenReps !== undefined) updatePayload.overridden_reps = patch.overriddenReps;

  const { data, error } = await client
    .from('progression_suggestions')
    .update(updatePayload)
    .eq('id', suggestionId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error || !data) {
    return result<PersistedProgressionSuggestion>(null, error ?? { message: 'Failed to update progression suggestion.' });
  }
  return { data: toPersisted(data), error: null };
}

/**
 * FR-6.1/Flow 2.2: the latest effective (accepted or overridden) suggestion
 * per exercise, for packages/api-client/src/plans.ts to overlay onto a
 * plan's static prescribed targets at read time. Rows are ordered newest
 * first so the first row seen per exercise_id is kept; pending/declined
 * rows are excluded entirely (a decline leaves the static plan value in
 * effect).
 */
export async function getLatestEffectiveSuggestionsForExercises(
  client: GymSupabaseClient,
  userId: string,
  exerciseIds: string[],
): Promise<ApiResult<Map<string, EffectiveSuggestionValue>>> {
  if (exerciseIds.length === 0) {
    return { data: new Map(), error: null };
  }

  const { data, error } = await client
    .from('progression_suggestions')
    .select('*')
    .eq('user_id', userId)
    .in('exercise_id', exerciseIds)
    .in('status', ['accepted', 'overridden'])
    .order('created_at', { ascending: false });
  if (error) {
    return result<Map<string, EffectiveSuggestionValue>>(null, error);
  }

  const effectiveByExerciseId = new Map<string, EffectiveSuggestionValue>();
  for (const row of data ?? []) {
    if (effectiveByExerciseId.has(row.exercise_id)) continue;
    effectiveByExerciseId.set(
      row.exercise_id,
      effectiveSuggestionValue({
        status: row.status as 'accepted' | 'overridden',
        suggestedWeightKg: row.suggested_weight_kg,
        suggestedReps: row.suggested_reps,
        overriddenWeightKg: row.overridden_weight_kg,
        overriddenReps: row.overridden_reps,
      }),
    );
  }
  return { data: effectiveByExerciseId, error: null };
}
