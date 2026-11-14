import {
  getCurrentPlan,
  getMuscleKeysForExercises,
  getPlannedSessionById,
  getProfile,
  getWorkoutSessionsForDay,
  listMuscleGroups,
  type GymSupabaseClient,
  type PersistedPrescribedExercise,
} from 'api-client';
import { buildDayMuscleCoverage, localDateString, type DayMuscleCoverage } from 'core';

import { loadWeekSchedule } from '../plan/weekScheduleData';

export interface DayCoverageData {
  date: string;
  coverage: DayMuscleCoverage;
  /** Names of the planned sessions the target came from (empty on a rest day). */
  plannedSessionNames: string[];
  /** How many sessions were logged that day. */
  loggedSessionCount: number;
}

interface PlannedTarget {
  id: string;
  name: string;
  exercises: PersistedPrescribedExercise[];
}

async function safe<T>(call: () => Promise<{ data: T | null; error: string | null }>): Promise<T | null> {
  try {
    const result = await call();
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}

/** Local midnight of a YYYY-MM-DD date. */
export function parseLocalDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The YYYY-MM-DD date `days` days from `date`. */
export function addLocalDays(date: string, days: number): string {
  const next = parseLocalDate(date);
  next.setDate(next.getDate() + days);
  return localDateString(next);
}

/**
 * The sessions planned for `date`. When the user logged any plan-attached
 * session that day, those are the target, using the plan version actually
 * followed (DR-5). Otherwise the current plan's schedule for that date
 * (FR-2.5, including moved and merged sessions) is used, provided the plan
 * was already in effect then. Neither gives a rest day (no target).
 */
async function plannedTargetsFor(
  client: GymSupabaseClient,
  userId: string,
  date: string,
  loggedPlannedIds: string[],
): Promise<PlannedTarget[]> {
  if (loggedPlannedIds.length > 0) {
    const details = await Promise.all(loggedPlannedIds.map((id) => safe(() => getPlannedSessionById(client, userId, id))));
    return details.filter((d): d is NonNullable<typeof d> => d !== null).map((d) => ({ id: d.id, name: d.name, exercises: d.exercises }));
  }

  const [plan, profile] = await Promise.all([safe(() => getCurrentPlan(client, userId)), safe(() => getProfile(client, userId))]);
  if (!plan || !profile) return [];
  if (localDateString(new Date(plan.effectiveFrom)) > date) return [];

  const week = await loadWeekSchedule({
    client,
    userId,
    plan,
    trainingWeekdays: profile.training_weekdays,
    trainingDaysPerWeek: profile.training_days_per_week,
    // Midday of the chosen date, so its week and "today" are that date.
    now: new Date(parseLocalDate(date).getTime() + 12 * 3600 * 1000),
  });
  const day = week?.schedule.days.find((d) => d.date === date);
  if (!day) return [];

  const byId = new Map(plan.sessions.map((s) => [s.id, s]));
  const ids = day.entries
    // done = completed on another day (a same-day completion is a logged session above); skipped = not planned any more.
    .filter((e) => e.status !== 'done' && e.status !== 'skipped')
    .flatMap((e) => [e.session.id, ...e.mergedFrom.map((m) => m.id)]);
  return [...new Set(ids)]
    .map((id) => byId.get(id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined)
    .map((s) => ({ id: s.id, name: s.name, exercises: s.exercises }));
}

/** FR-8.5: one local day's done vs planned work per muscle. */
export async function loadDayCoverage(args: { client: GymSupabaseClient; userId: string; date: string }): Promise<DayCoverageData> {
  const { client, userId, date } = args;
  const start = parseLocalDate(date);
  const end = parseLocalDate(addLocalDays(date, 1));

  const sessionsRes = await getWorkoutSessionsForDay(client, userId, start.toISOString(), end.toISOString());
  if (sessionsRes.error) throw new Error(sessionsRes.error);
  const sessions = sessionsRes.data ?? [];

  const loggedPlannedIds = [
    ...new Set(sessions.map((s) => s.session.plannedSessionId).filter((id): id is string => id !== null)),
  ];
  const targets = await plannedTargetsFor(client, userId, date, loggedPlannedIds);

  const setsByExercise = new Map<string, number>();
  for (const entry of sessions) {
    for (const log of entry.setLogs) setsByExercise.set(log.exerciseId, (setsByExercise.get(log.exerciseId) ?? 0) + 1);
  }
  const plannedExercises = targets.flatMap((t) => t.exercises);

  const [muscleKeys, muscleGroups] = await Promise.all([
    safe(() => getMuscleKeysForExercises(client, [...setsByExercise.keys(), ...plannedExercises.map((ex) => ex.exerciseId)])),
    safe(() => listMuscleGroups(client)),
  ]);
  const musclesOf = (exerciseId: string) => {
    const keys = muscleKeys?.get(exerciseId);
    return { primaryMuscleKeys: keys?.primary ?? [], secondaryMuscleKeys: keys?.secondary ?? [] };
  };

  const coverage = buildDayMuscleCoverage({
    planned: plannedExercises.map((ex) => ({ sets: ex.targetSets, ...musclesOf(ex.exerciseId) })),
    done: [...setsByExercise.entries()].map(([exerciseId, sets]) => ({ sets, ...musclesOf(exerciseId) })),
    muscleNames: Object.fromEntries((muscleGroups ?? []).map((m) => [m.key, m.display_name])),
  });

  return {
    date,
    coverage,
    plannedSessionNames: targets.map((t) => t.name),
    loggedSessionCount: sessions.length,
  };
}
