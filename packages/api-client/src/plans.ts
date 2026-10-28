import {
  diffPlans,
  generatePlan,
  toComparablePlan,
  type ComparablePlan,
  type GeneratedPlan,
  type PlanDiffSummary,
  type PlanGeneratorInput,
} from 'core';

import type { GymSupabaseClient } from './client';
import { getExercisesWithTags } from './exercises';
import { getProfile, getUserEquipmentIds, listEquipmentItems, type ApiResult } from './profile';
import type { Database } from './types/database';

export type WorkoutPlanRow = Database['public']['Tables']['workout_plans']['Row'];
export type PlannedSessionRow = Database['public']['Tables']['planned_sessions']['Row'];
export type PlannedSessionExerciseRow = Database['public']['Tables']['planned_session_exercises']['Row'];

export interface PersistedPrescribedExercise {
  id: string;
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number | null;
  targetWeightKg: number | null;
  intensityNote: string | null;
}

export interface PersistedSession {
  id: string;
  dayOrder: number;
  name: string;
  exercises: PersistedPrescribedExercise[];
}

export interface PersistedPlan {
  id: string;
  splitType: WorkoutPlanRow['split_type'];
  planVersion: number;
  effectiveFrom: string;
  sessions: PersistedSession[];
}

export interface RegenerationPreview {
  candidatePlan: GeneratedPlan;
  diffSummary: PlanDiffSummary;
  currentPlan: PersistedPlan | null;
}

function result<T>(data: T | null, error: { message: string } | null): ApiResult<T> {
  return { data, error: error ? error.message : null };
}

function toPersistedPlan(
  planRow: WorkoutPlanRow,
  sessionRows: PlannedSessionRow[],
  exerciseRows: PlannedSessionExerciseRow[],
  exerciseNameById: Map<string, string>,
): PersistedPlan {
  const exercisesBySessionId = new Map<string, PersistedPrescribedExercise[]>();
  for (const row of exerciseRows) {
    const list = exercisesBySessionId.get(row.planned_session_id) ?? [];
    list.push({
      id: row.id,
      exerciseId: row.exercise_id,
      exerciseName: exerciseNameById.get(row.exercise_id) ?? row.exercise_id,
      orderIndex: row.order_index,
      targetSets: row.target_sets,
      targetRepsMin: row.target_reps_min,
      targetRepsMax: row.target_reps_max,
      targetWeightKg: row.target_weight_kg,
      intensityNote: row.intensity_note,
    });
    exercisesBySessionId.set(row.planned_session_id, list);
  }

  const sessions: PersistedSession[] = sessionRows.map((s) => ({
    id: s.id,
    dayOrder: s.day_order,
    name: s.name,
    exercises: (exercisesBySessionId.get(s.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex),
  }));

  return {
    id: planRow.id,
    splitType: planRow.split_type,
    planVersion: planRow.plan_version,
    effectiveFrom: planRow.effective_from,
    sessions: sessions.sort((a, b) => a.dayOrder - b.dayOrder),
  };
}

/**
 * FR-2.4: the signed-in user's currently active (non-superseded) plan, or
 * null if none exists yet. Flat queries + JS-side joins, following
 * exercises.ts's getExercisesWithTags pattern (the hand-authored Database
 * type declares Relationships: never[] for every table).
 */
export async function getCurrentPlan(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<PersistedPlan | null>> {
  const { data: planRow, error: planError } = await client
    .from('workout_plans')
    .select('*')
    .eq('user_id', userId)
    .is('superseded_at', null)
    .order('plan_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError) {
    return result(null, planError);
  }
  if (!planRow) {
    return { data: null, error: null };
  }

  const { data: sessionRows, error: sessionsError } = await client
    .from('planned_sessions')
    .select('*')
    .eq('workout_plan_id', planRow.id)
    .order('day_order');
  if (sessionsError) {
    return result(null, sessionsError);
  }

  const sessions = sessionRows ?? [];
  const sessionIds = sessions.map((s) => s.id);
  let exerciseRows: PlannedSessionExerciseRow[] = [];
  let exerciseNameById = new Map<string, string>();

  if (sessionIds.length > 0) {
    const { data: exRows, error: exError } = await client
      .from('planned_session_exercises')
      .select('*')
      .in('planned_session_id', sessionIds)
      .order('order_index');
    if (exError) {
      return result(null, exError);
    }
    exerciseRows = exRows ?? [];

    const exerciseIds = [...new Set(exerciseRows.map((e) => e.exercise_id))];
    if (exerciseIds.length > 0) {
      const { data: nameRows, error: nameError } = await client
        .from('exercises')
        .select('id, name')
        .in('id', exerciseIds);
      if (nameError) {
        return result(null, nameError);
      }
      exerciseNameById = new Map((nameRows ?? []).map((row) => [row.id, row.name]));
    }
  }

  return { data: toPersistedPlan(planRow, sessions, exerciseRows, exerciseNameById), error: null };
}

/**
 * FR-2.1/DR-5: persists a freshly generated plan as a brand-new, insert-only
 * plan_version — never updates or deletes an existing workout_plans row.
 * plan_version is deliberately omitted on insert (the DB trigger assigns
 * it and auto-supersedes the prior version, see
 * 0009_plan_target_versioning.sql). Three sequential inserts
 * (workout_plans -> planned_sessions -> planned_session_exercises), each
 * checked for error before proceeding — NOT transactional, mirroring
 * setUserEquipment's documented non-atomic limitation: a failure after the
 * workout_plans insert leaves a version row with zero/partial sessions,
 * accepted as a rare-but-possible failure mode for this product's
 * single-user write pattern rather than retried or rolled back (no
 * client-side rollback is possible against an insert-only/immutable table
 * without service-role access).
 */
export async function createWorkoutPlan(
  client: GymSupabaseClient,
  userId: string,
  plan: GeneratedPlan,
): Promise<ApiResult<PersistedPlan>> {
  const { data: planRow, error: planError } = await client
    .from('workout_plans')
    .insert({ user_id: userId, split_type: plan.splitType })
    .select()
    .single();
  if (planError || !planRow) {
    return result<PersistedPlan>(null, planError ?? { message: 'Failed to create workout plan.' });
  }

  const { data: sessionRows, error: sessionsError } = await client
    .from('planned_sessions')
    .insert(
      plan.sessions.map((s) => ({
        workout_plan_id: planRow.id,
        user_id: userId,
        day_order: s.dayOrder,
        name: s.name,
      })),
    )
    .select();
  if (sessionsError || !sessionRows) {
    return result<PersistedPlan>(null, sessionsError ?? { message: 'Failed to create planned sessions.' });
  }

  const sessionIdByDayOrder = new Map(sessionRows.map((s) => [s.day_order, s.id]));
  const exerciseInserts = plan.sessions.flatMap((s) =>
    s.exercises.map((ex) => ({
      planned_session_id: sessionIdByDayOrder.get(s.dayOrder) as string,
      user_id: userId,
      exercise_id: ex.exerciseId,
      order_index: ex.orderIndex,
      target_sets: ex.targetSets,
      target_reps_min: ex.targetRepsMin,
      target_reps_max: ex.targetRepsMax,
      target_weight_kg: ex.targetWeightKg,
      intensity_note: ex.intensityNote,
    })),
  );

  let exerciseRows: PlannedSessionExerciseRow[] = [];
  if (exerciseInserts.length > 0) {
    const { data: exRows, error: exError } = await client
      .from('planned_session_exercises')
      .insert(exerciseInserts)
      .select();
    if (exError || !exRows) {
      return result<PersistedPlan>(null, exError ?? { message: 'Failed to create planned session exercises.' });
    }
    exerciseRows = exRows;
  }

  const exerciseNameById = new Map(
    plan.sessions.flatMap((s) => s.exercises).map((ex) => [ex.exerciseId, ex.exerciseName]),
  );

  return {
    data: toPersistedPlan(planRow, sessionRows, exerciseRows, exerciseNameById),
    error: null,
  };
}

async function fetchPlanGeneratorInput(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<PlanGeneratorInput>> {
  const [profileRes, equipmentIdsRes, equipmentItemsRes, exercisesRes] = await Promise.all([
    getProfile(client, userId),
    getUserEquipmentIds(client, userId),
    listEquipmentItems(client),
    getExercisesWithTags(client),
  ]);

  const firstError = profileRes.error ?? equipmentIdsRes.error ?? equipmentItemsRes.error ?? exercisesRes.error;
  if (firstError) {
    return { data: null, error: firstError };
  }
  if (!profileRes.data) {
    return { data: null, error: 'No profile found for this user; complete onboarding first.' };
  }

  const equipmentKeyById = new Map((equipmentItemsRes.data ?? []).map((item) => [item.id, item.key]));
  const availableEquipmentKeys = (equipmentIdsRes.data ?? [])
    .map((id) => equipmentKeyById.get(id))
    .filter((key): key is string => Boolean(key));

  return {
    data: {
      goal: profileRes.data.goal,
      fitnessLevel: profileRes.data.fitness_level,
      trainingDaysPerWeek: profileRes.data.training_days_per_week,
      availableEquipmentKeys,
      exerciseLibrary: exercisesRes.data ?? [],
    },
    error: null,
  };
}

/** AC-1: the user's first-ever plan — fetches profile/equipment/library, generates, and persists it. No diff needed (nothing preceded it). */
export async function generateInitialPlan(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<PersistedPlan>> {
  const inputRes = await fetchPlanGeneratorInput(client, userId);
  if (inputRes.error || !inputRes.data) {
    return { data: null, error: inputRes.error ?? 'Failed to assemble plan generator input.' };
  }
  const plan = generatePlan(inputRes.data);
  return createWorkoutPlan(client, userId, plan);
}

function currentPlanToComparable(currentPlan: PersistedPlan | null, fallbackSplitType: GeneratedPlan['splitType']): ComparablePlan {
  if (!currentPlan) {
    return { splitType: fallbackSplitType, sessions: [] };
  }
  return {
    splitType: currentPlan.splitType,
    sessions: currentPlan.sessions.map((s) => ({
      dayOrder: s.dayOrder,
      name: s.name,
      exercises: s.exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        targetSets: ex.targetSets,
        targetRepsMin: ex.targetRepsMin,
        targetRepsMax: ex.targetRepsMax ?? ex.targetRepsMin,
      })),
    })),
  };
}

/**
 * FR-2.4/Flow 2.7: builds the candidate next plan (pure, in-memory, zero
 * writes) from the user's CURRENT profile/equipment/library, and diffs it
 * against their current persisted plan. Shared by both the profile-edit
 * regeneration prompt (FR-1.4) and the on-demand regenerate action, so both
 * entry points compute the identical candidate the same way. Guaranteed
 * not to call insert/update/delete on any table.
 */
export async function buildRegenerationPreview(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<RegenerationPreview>> {
  const [inputRes, currentPlanRes] = await Promise.all([
    fetchPlanGeneratorInput(client, userId),
    getCurrentPlan(client, userId),
  ]);
  if (inputRes.error || !inputRes.data) {
    return { data: null, error: inputRes.error ?? 'Failed to assemble plan generator input.' };
  }
  if (currentPlanRes.error) {
    return { data: null, error: currentPlanRes.error };
  }

  const candidatePlan = generatePlan(inputRes.data);
  const currentPlan = currentPlanRes.data;
  const diffSummary = diffPlans(
    currentPlanToComparable(currentPlan, candidatePlan.splitType),
    toComparablePlan(candidatePlan),
  );

  return { data: { candidatePlan, diffSummary, currentPlan }, error: null };
}
