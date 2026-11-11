import { getCurrentPlan, getWorkoutSessionHistory, listMuscleGroups, type GymSupabaseClient } from 'api-client';
import {
  buildSessionSummary,
  determineNextPlannedSessionAfter,
  toAiFacts,
  type ExerciseWithTags,
  type FitnessLevel,
  type Goal,
  type SessionAiFacts,
  type SessionSummary,
  type SessionSummaryInput,
  type UnitPreference,
} from 'core';

export interface BuildSummaryArgs {
  client: GymSupabaseClient;
  userId: string;
  sessionName: string;
  startedAt: string | null;
  goal: Goal | null;
  fitnessLevel: FitnessLevel | null;
  unitPreference: UnitPreference;
  exerciseLibrary: ExerciseWithTags[];
  exercises: Omit<SessionSummaryInput['exercises'][number], 'primaryMuscleKeys' | 'secondaryMuscleKeys' | 'mechanic'>[];
  logs: SessionSummaryInput['logs'];
  priorLogs: SessionSummaryInput['logs'];
  newPrs: SessionSummaryInput['newPrs'];
  progression: SessionSummaryInput['progression'];
  /** The planned session just completed; null for freeform (then the last completed planned session is used). */
  completedPlannedSessionId: string | null;
}

async function safe<T>(call: () => Promise<{ data: T | null; error: string | null }>): Promise<T | null> {
  try {
    const result = await call();
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}

/**
 * FR-8.4: gathers what the post-session summary needs beyond the session
 * itself (muscle names, the next planned session) and builds it. Lookups
 * that fail only leave their part out (raw muscle keys, no next session);
 * the summary itself always builds.
 */
export async function buildSummaryForSession(args: BuildSummaryArgs): Promise<{ summary: SessionSummary; aiFacts: SessionAiFacts }> {
  const [muscleGroups, plan, history] = await Promise.all([
    safe(() => listMuscleGroups(args.client)),
    safe(() => getCurrentPlan(args.client, args.userId)),
    args.completedPlannedSessionId === null ? safe(() => getWorkoutSessionHistory(args.client, args.userId)) : Promise.resolve(null),
  ]);

  const muscleNames = Object.fromEntries((muscleGroups ?? []).map((m) => [m.key, m.display_name]));
  const tagsById = new Map(args.exerciseLibrary.map((e) => [e.id, e]));

  const lastPlannedId =
    args.completedPlannedSessionId ??
    (history ?? []).find((entry) => entry.session.status === 'completed' && entry.session.plannedSessionId)?.session.plannedSessionId ??
    null;
  const next = plan ? determineNextPlannedSessionAfter(plan.sessions, lastPlannedId) : null;

  const summary = buildSessionSummary({
    sessionName: args.sessionName,
    startedAt: args.startedAt,
    completedAt: new Date().toISOString(),
    goal: args.goal,
    fitnessLevel: args.fitnessLevel,
    unitPreference: args.unitPreference,
    exercises: args.exercises.map((ex) => {
      const tags = tagsById.get(ex.exerciseId);
      return {
        ...ex,
        primaryMuscleKeys: tags?.primaryMuscleKeys ?? [],
        secondaryMuscleKeys: tags?.secondaryMuscleKeys ?? [],
        mechanic: tags?.mechanic ?? null,
      };
    }),
    logs: args.logs,
    priorLogs: args.priorLogs,
    muscleNames,
    newPrs: args.newPrs,
    progression: args.progression,
    nextSession: next
      ? {
          name: next.name,
          exercises: next.exercises.map((ex) => ({
            name: ex.exerciseName,
            primaryMuscleKeys: tagsById.get(ex.exerciseId)?.primaryMuscleKeys ?? [],
            secondaryMuscleKeys: tagsById.get(ex.exerciseId)?.secondaryMuscleKeys ?? [],
          })),
        }
      : null,
  });

  return { summary, aiFacts: toAiFacts(summary, args.unitPreference, args.fitnessLevel) };
}
