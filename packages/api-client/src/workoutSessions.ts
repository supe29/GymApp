import type { ApiResult } from './profile';
import type { GymSupabaseClient } from './client';
import type { Database } from './types/database';

export type WorkoutSessionRow = Database['public']['Tables']['workout_sessions']['Row'];
export type SetLogRow = Database['public']['Tables']['set_logs']['Row'];

export interface PersistedWorkoutSession {
  id: string;
  plannedSessionId: string | null;
  workoutPlanId: string | null;
  status: WorkoutSessionRow['status'];
  startedAt: string;
  completedAt: string | null;
}

export interface PersistedSetLog {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  loggedAt: string;
}

export interface SetLogInput {
  /** Client-generated, used as the idempotency key for retry-safe upserts (NFR-3). */
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
}

export interface WorkoutSessionHistoryEntry {
  session: PersistedWorkoutSession;
  exerciseNames: Record<string, string>;
  setLogs: PersistedSetLog[];
}

function result<T>(data: T | null, error: { message: string } | null): ApiResult<T> {
  return { data, error: error ? error.message : null };
}

function toPersistedSession(row: WorkoutSessionRow): PersistedWorkoutSession {
  return {
    id: row.id,
    plannedSessionId: row.planned_session_id,
    workoutPlanId: row.workout_plan_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function toPersistedSetLog(row: SetLogRow): PersistedSetLog {
  return {
    id: row.id,
    workoutSessionId: row.workout_session_id,
    exerciseId: row.exercise_id,
    setIndex: row.set_index,
    weightKg: row.weight_kg,
    reps: row.reps,
    rpe: row.rpe,
    loggedAt: row.logged_at,
  };
}

/**
 * FR-5.2: starts a new workout session, plan-attached (`plannedSessionId`
 * given) or freeform (omitted). `workout_plan_id` is never set client-side
 * — a BEFORE INSERT trigger derives it from `planned_session_id` (see
 * 0009_plan_target_versioning.sql), so it stays correct even if the
 * active plan is later regenerated.
 */
export async function startWorkoutSession(
  client: GymSupabaseClient,
  userId: string,
  plannedSessionId?: string,
): Promise<ApiResult<PersistedWorkoutSession>> {
  const { data, error } = await client
    .from('workout_sessions')
    .insert({ user_id: userId, planned_session_id: plannedSessionId ?? null, completed_at: null })
    .select()
    .single();
  if (error || !data) {
    return result<PersistedWorkoutSession>(null, error ?? { message: 'Failed to start workout session.' });
  }
  return { data: toPersistedSession(data), error: null };
}

/**
 * FR-5.1/NFR-3: logs (or re-logs) one set. Uses `upsert` keyed on the
 * client-supplied `id` rather than `insert`, so a retried sync attempt
 * (after a connectivity drop left the first attempt's result unknown) is
 * idempotent — it either creates the row or confirms it already exists
 * with the same values, never a duplicate or a unique-constraint error.
 * See /docs/decisions/OQ-11-connectivity-retry-policy.md.
 */
export async function logSet(
  client: GymSupabaseClient,
  userId: string,
  input: SetLogInput,
): Promise<ApiResult<PersistedSetLog>> {
  const { data, error } = await client
    .from('set_logs')
    .upsert(
      {
        id: input.id,
        user_id: userId,
        workout_session_id: input.workoutSessionId,
        exercise_id: input.exerciseId,
        set_index: input.setIndex,
        weight_kg: input.weightKg,
        reps: input.reps,
        rpe: input.rpe,
      },
      { onConflict: 'id' },
    )
    .select()
    .single();
  if (error || !data) {
    return result<PersistedSetLog>(null, error ?? { message: 'Failed to log set.' });
  }
  return { data: toPersistedSetLog(data), error: null };
}

/**
 * FR-5.1: deletes one logged set (e.g. one logged by mistake), scoped to
 * the owning user. Deleting a row that doesn't exist (a set that never
 * synced) is a no-op success, so callers can always call it.
 */
export async function deleteSetLog(
  client: GymSupabaseClient,
  userId: string,
  setLogId: string,
): Promise<ApiResult<null>> {
  const { error } = await client.from('set_logs').delete().eq('id', setLogId).eq('user_id', userId);
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: null, error: null };
}

/** FR-5.5: marks a session complete. */
export async function completeWorkoutSession(
  client: GymSupabaseClient,
  userId: string,
  workoutSessionId: string,
): Promise<ApiResult<PersistedWorkoutSession>> {
  const { data, error } = await client
    .from('workout_sessions')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', workoutSessionId)
    .eq('user_id', userId)
    .select()
    .single();
  if (error || !data) {
    return result<PersistedWorkoutSession>(null, error ?? { message: 'Failed to complete workout session.' });
  }
  return { data: toPersistedSession(data), error: null };
}

/** Resume support: the set logs already recorded for an in-progress (or completed) session. */
export async function getSetLogsForSession(
  client: GymSupabaseClient,
  userId: string,
  workoutSessionId: string,
): Promise<ApiResult<PersistedSetLog[]>> {
  const { data, error } = await client
    .from('set_logs')
    .select('*')
    .eq('workout_session_id', workoutSessionId)
    .eq('user_id', userId)
    .order('set_index');
  if (error) {
    return result<PersistedSetLog[]>(null, error);
  }
  return { data: (data ?? []).map(toPersistedSetLog), error: null };
}

/**
 * FR-8.2/NFR-4: every logged set for the given exercises, across every
 * session (not just one) — Phase 10's PR derivation needs this to find the
 * all-time heaviest set per rep-count bucket, unlike `getSetLogsForSession`
 * which Phase 8's progression evaluation scopes to a single session.
 * Scoped to the exercises actually touched this session rather than the
 * user's entire lifetime log, to keep the fetch bounded.
 */
export async function getSetLogsForExercises(
  client: GymSupabaseClient,
  userId: string,
  exerciseIds: string[],
): Promise<ApiResult<PersistedSetLog[]>> {
  if (exerciseIds.length === 0) {
    return { data: [], error: null };
  }
  const { data, error } = await client
    .from('set_logs')
    .select('*')
    .eq('user_id', userId)
    .in('exercise_id', exerciseIds);
  if (error) {
    return result<PersistedSetLog[]>(null, error);
  }
  return { data: (data ?? []).map(toPersistedSetLog), error: null };
}

/**
 * FR-5.5/AC-8: the user's past sessions (most recent first), each with
 * its set logs and a flat exercise-id -> name lookup, for
 * WorkoutHistoryScreen.tsx. Flat queries + JS-side joins, following
 * plans.ts's getCurrentPlan pattern (the hand-authored Database type
 * declares Relationships: never[] for every table).
 */
export async function getWorkoutSessionHistory(
  client: GymSupabaseClient,
  userId: string,
  limit = 20,
): Promise<ApiResult<WorkoutSessionHistoryEntry[]>> {
  const { data: sessionRows, error: sessionsError } = await client
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (sessionsError) {
    return result<WorkoutSessionHistoryEntry[]>(null, sessionsError);
  }
  return attachSetLogs(client, sessionRows ?? []);
}

/**
 * FR-8.5: every session the user started in [startIso, endIso) — one local
 * day for the Body progress screen — with its set logs and exercise names.
 */
export async function getWorkoutSessionsForDay(
  client: GymSupabaseClient,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<ApiResult<WorkoutSessionHistoryEntry[]>> {
  const { data: sessionRows, error: sessionsError } = await client
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', startIso)
    .lt('started_at', endIso)
    .order('started_at', { ascending: true });
  if (sessionsError) {
    return result<WorkoutSessionHistoryEntry[]>(null, sessionsError);
  }
  return attachSetLogs(client, sessionRows ?? []);
}

export interface CompletedSessionInRange {
  plannedSessionId: string | null;
  completedAt: string;
}

/**
 * FR-2.8: every session the user completed in [startIso, endIso), without
 * set logs — enough for the week/month plan views to mark sessions done.
 * Bounded by date rather than by the most recent N sessions, so older
 * weeks keep their done status.
 */
export async function getCompletedSessionsInRange(
  client: GymSupabaseClient,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<ApiResult<CompletedSessionInRange[]>> {
  const { data, error } = await client
    .from('workout_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', startIso)
    .lt('completed_at', endIso);
  if (error) return result<CompletedSessionInRange[]>(null, error);
  return {
    data: (data ?? [])
      .filter((row) => row.completed_at)
      .map((row) => ({ plannedSessionId: row.planned_session_id, completedAt: row.completed_at as string })),
    error: null,
  };
}

async function attachSetLogs(
  client: GymSupabaseClient,
  sessions: WorkoutSessionRow[],
): Promise<ApiResult<WorkoutSessionHistoryEntry[]>> {
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) {
    return { data: [], error: null };
  }

  const { data: setLogRows, error: setLogsError } = await client
    .from('set_logs')
    .select('*')
    .in('workout_session_id', sessionIds)
    .order('set_index');
  if (setLogsError) {
    return result<WorkoutSessionHistoryEntry[]>(null, setLogsError);
  }

  const setLogs = (setLogRows ?? []).map(toPersistedSetLog);
  const exerciseIds = [...new Set(setLogs.map((log) => log.exerciseId))];

  let exerciseNameById = new Map<string, string>();
  if (exerciseIds.length > 0) {
    const { data: nameRows, error: nameError } = await client
      .from('exercises')
      .select('id, name')
      .in('id', exerciseIds);
    if (nameError) {
      return result<WorkoutSessionHistoryEntry[]>(null, nameError);
    }
    exerciseNameById = new Map((nameRows ?? []).map((row) => [row.id, row.name]));
  }
  const exerciseNames = Object.fromEntries(exerciseNameById);

  const setLogsBySession = new Map<string, PersistedSetLog[]>();
  for (const log of setLogs) {
    const list = setLogsBySession.get(log.workoutSessionId) ?? [];
    list.push(log);
    setLogsBySession.set(log.workoutSessionId, list);
  }

  const entries: WorkoutSessionHistoryEntry[] = sessions.map((row) => ({
    session: toPersistedSession(row),
    exerciseNames,
    setLogs: setLogsBySession.get(row.id) ?? [],
  }));

  return { data: entries, error: null };
}
