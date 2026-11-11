import {
  createScheduleAdjustment,
  deleteScheduleAdjustment,
  getScheduleAdjustments,
  getWorkoutSessionHistory,
  type GymSupabaseClient,
  type PersistedPlan,
  type PersistedScheduleAdjustment,
} from 'api-client';
import {
  buildWeekSchedule,
  localDateString,
  startOfLocalWeek,
  validWeekdays,
  type MissedOption,
  type ScheduleEntry,
  type WeekSchedule,
  type Weekday,
} from 'core';

export interface WeekScheduleData {
  schedule: WeekSchedule;
  adjustments: PersistedScheduleAdjustment[];
  weekdays: Weekday[];
  weekStart: string;
  today: string;
}

async function safe<T>(call: () => Promise<{ data: T | null; error: string | null }>): Promise<T | null> {
  try {
    const result = await call();
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}

/** Monday (YYYY-MM-DD) of the week `weekOffset` weeks from the one containing `now`. */
export function weekStartFor(now: Date, weekOffset = 0): string {
  const monday = startOfLocalWeek(now);
  monday.setDate(monday.getDate() + weekOffset * 7);
  return localDateString(monday);
}

/**
 * FR-2.5: this (or a later) week's schedule for the current plan, or null
 * when the user hasn't picked valid training weekdays yet. History and
 * adjustment lookups that fail leave the schedule without them rather
 * than failing it.
 */
export async function loadWeekSchedule(args: {
  client: GymSupabaseClient;
  userId: string;
  plan: PersistedPlan;
  trainingWeekdays: readonly number[] | null | undefined;
  trainingDaysPerWeek: number;
  now?: Date;
  weekOffset?: number;
}): Promise<WeekScheduleData | null> {
  const weekdays = validWeekdays(args.trainingWeekdays, args.trainingDaysPerWeek);
  if (!weekdays) return null;

  const now = args.now ?? new Date();
  const weekStart = weekStartFor(now, args.weekOffset ?? 0);
  const [history, adjustments] = await Promise.all([
    safe(() => getWorkoutSessionHistory(args.client, args.userId)),
    safe(() => getScheduleAdjustments(args.client, args.userId, args.plan.id, weekStart)),
  ]);

  const today = localDateString(now);
  const schedule = buildWeekSchedule({
    sessions: args.plan.sessions.map((s) => ({
      id: s.id,
      dayOrder: s.dayOrder,
      name: s.name,
      exerciseIds: s.exercises.map((ex) => ex.exerciseId),
    })),
    weekdays,
    weekStart,
    today,
    completed: (history ?? [])
      .filter((entry) => entry.session.status === 'completed' && entry.session.completedAt)
      .map((entry) => ({ plannedSessionId: entry.session.plannedSessionId, completedAt: entry.session.completedAt as string })),
    adjustments: adjustments ?? [],
  });

  return { schedule, adjustments: adjustments ?? [], weekdays, weekStart, today };
}

/** FR-2.6: records the chosen option for a missed session (and the shifted session, for "do it today"). */
export async function applyMissedOption(args: {
  client: GymSupabaseClient;
  userId: string;
  planId: string;
  weekStart: string;
  missed: ScheduleEntry;
  option: MissedOption;
}): Promise<string | null> {
  const base = { workoutPlanId: args.planId, weekStart: args.weekStart };
  if (args.option.kind === 'move') {
    if (args.option.shift) {
      const shifted = await createScheduleAdjustment(args.client, args.userId, {
        ...base,
        plannedSessionId: args.option.shift.plannedSessionId,
        action: 'move',
        targetDate: args.option.shift.targetDate,
      });
      if (shifted.error) return shifted.error;
    }
    const moved = await createScheduleAdjustment(args.client, args.userId, {
      ...base,
      plannedSessionId: args.missed.session.id,
      action: 'move',
      targetDate: args.option.targetDate,
    });
    return moved.error;
  }
  if (args.option.kind === 'merge') {
    const merged = await createScheduleAdjustment(args.client, args.userId, {
      ...base,
      plannedSessionId: args.missed.session.id,
      action: 'merge',
      mergeIntoPlannedSessionId: args.option.intoPlannedSessionId,
    });
    return merged.error;
  }
  const skipped = await createScheduleAdjustment(args.client, args.userId, {
    ...base,
    plannedSessionId: args.missed.session.id,
    action: 'skip',
  });
  return skipped.error;
}

/**
 * FR-2.6: undoes the choice made for one session. A "do it today" choice
 * is two moves (the missed session into today, today's session to a free
 * day); undoing either half undoes both, so two sessions never end up on
 * the same day.
 */
export async function undoChoice(args: {
  client: GymSupabaseClient;
  userId: string;
  data: WeekScheduleData;
  entry: ScheduleEntry;
}): Promise<string | null> {
  const own = args.data.adjustments.filter((a) => a.plannedSessionId === args.entry.session.id);
  const entries = args.data.schedule.days.flatMap((d) => d.entries).filter((e) => e.session.id !== args.entry.session.id);
  const paired =
    args.entry.movedFrom !== null
      ? entries.filter(
          (e) =>
            e.movedFrom !== null &&
            // the session this one pushed out of its new day, or the one that took this one's old day
            (e.movedFrom === args.entry.date || e.date === args.entry.movedFrom),
        )
      : [];
  const pairedAdjustments = paired.flatMap((e) =>
    args.data.adjustments.filter((a) => a.plannedSessionId === e.session.id && a.action === 'move'),
  );
  for (const adjustment of [...own, ...pairedAdjustments]) {
    const result = await deleteScheduleAdjustment(args.client, args.userId, adjustment.id);
    if (result.error) return result.error;
  }
  return null;
}
