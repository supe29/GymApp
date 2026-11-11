// FR-2.5/FR-2.6 (resolves OQ-5, docs/decisions/OQ-5-session-rescheduling.md):
// the plan laid out on the user's chosen weekdays, and rule-based options
// for a missed session. Pure and date-string based (local YYYY-MM-DD), so
// it is deterministic and testable; the app supplies "today".
//
// Each week starts fresh: plan day N falls on the Nth chosen weekday, a
// session counts as done if it was completed anywhere in that week, and a
// missed session that the user never resolves simply stays "missed" for
// that week (it is not carried into the next one).

import { localDateString } from '../dates/localDate';

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const WEEKDAY_SHORT: Record<Weekday, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

export interface ScheduleSession {
  id: string;
  dayOrder: number;
  name: string;
  exerciseIds: string[];
}

export interface ScheduleAdjustment {
  plannedSessionId: string;
  action: 'skip' | 'move' | 'merge';
  targetDate: string | null;
  mergeIntoPlannedSessionId: string | null;
}

export interface CompletedSessionRecord {
  plannedSessionId: string | null;
  completedAt: string;
}

export type EntryStatus = 'done' | 'today' | 'upcoming' | 'missed' | 'skipped' | 'merged';

export interface ScheduleEntry {
  session: ScheduleSession;
  status: EntryStatus;
  /** The date it is shown on (its planned weekday, or where it was moved to). */
  date: string;
  /** Its planned date, when it was moved away from it. */
  movedFrom: string | null;
  /** The session it was merged into, if merged. */
  mergedInto: ScheduleSession | null;
  /** Sessions merged into this one (do them together). */
  mergedFrom: ScheduleSession[];
}

export interface ScheduleDay {
  date: string;
  weekday: Weekday;
  entries: ScheduleEntry[];
}

export interface WeekSchedule {
  weekStart: string;
  days: ScheduleDay[];
  /** Missed sessions the user has not resolved yet, oldest first. */
  missed: ScheduleEntry[];
  /** Today's session if not done yet, else the next upcoming one; null when the week is finished. */
  next: ScheduleEntry | null;
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDateString(new Date(y, m - 1, d + days));
}

function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  return (((new Date(y, m - 1, d).getDay() + 6) % 7) + 1) as Weekday;
}

/** An even spread of `count` training days across the week, used to prefill the day picker. */
export function defaultWeekdays(count: number): Weekday[] {
  const spreads: Record<number, Weekday[]> = {
    1: [3],
    2: [1, 4],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 5, 6],
    6: [1, 2, 3, 4, 5, 6],
    7: [1, 2, 3, 4, 5, 6, 7],
  };
  return spreads[Math.min(7, Math.max(1, Math.round(count)))];
}

/** The stored weekdays if they are valid for this day count (sorted, unique, 1-7, right length), else null. */
export function validWeekdays(weekdays: readonly number[] | null | undefined, count: number): Weekday[] | null {
  if (!weekdays) return null;
  const unique = [...new Set(weekdays)].sort((a, b) => a - b);
  if (unique.length !== count || unique.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return null;
  return unique as Weekday[];
}

export interface BuildWeekScheduleInput {
  sessions: ScheduleSession[];
  weekdays: Weekday[];
  /** Monday of the week, YYYY-MM-DD. */
  weekStart: string;
  /** Today, YYYY-MM-DD (local). */
  today: string;
  completed: CompletedSessionRecord[];
  adjustments: ScheduleAdjustment[];
}

export function buildWeekSchedule(input: BuildWeekScheduleInput): WeekSchedule {
  const weekEnd = addDays(input.weekStart, 7);
  const byDayOrder = [...input.sessions].sort((a, b) => a.dayOrder - b.dayOrder);
  const sessionById = new Map(byDayOrder.map((s) => [s.id, s]));
  const adjustmentFor = new Map(input.adjustments.map((a) => [a.plannedSessionId, a]));

  const doneThisWeek = new Set(
    input.completed
      .filter((c) => c.plannedSessionId !== null)
      .filter((c) => {
        const day = localDateString(new Date(c.completedAt));
        return day >= input.weekStart && day < weekEnd;
      })
      .map((c) => c.plannedSessionId as string),
  );

  const entries: ScheduleEntry[] = byDayOrder.slice(0, input.weekdays.length).map((session, i) => {
    const planned = addDays(input.weekStart, input.weekdays[i] - 1);
    const adjustment = adjustmentFor.get(session.id);
    const moved = adjustment?.action === 'move' && adjustment.targetDate ? adjustment.targetDate : null;
    const mergedInto =
      adjustment?.action === 'merge' && adjustment.mergeIntoPlannedSessionId
        ? (sessionById.get(adjustment.mergeIntoPlannedSessionId) ?? null)
        : null;
    const date = moved ?? planned;

    let status: EntryStatus;
    if (doneThisWeek.has(session.id) || (mergedInto && doneThisWeek.has(mergedInto.id))) status = 'done';
    else if (mergedInto) status = 'merged';
    else if (adjustment?.action === 'skip') status = 'skipped';
    else if (date < input.today) status = 'missed';
    else if (date === input.today) status = 'today';
    else status = 'upcoming';

    return { session, status, date, movedFrom: moved && moved !== planned ? planned : null, mergedInto, mergedFrom: [] };
  });

  for (const entry of entries) {
    if (entry.mergedInto) {
      entries.find((e) => e.session.id === entry.mergedInto?.id)?.mergedFrom.push(entry.session);
    }
  }

  const days: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(input.weekStart, i);
    return {
      date,
      weekday: (i + 1) as Weekday,
      // A merged session is listed with the one it was merged into, not on its own day.
      entries: entries.filter((e) => e.date === date && e.status !== 'merged'),
    };
  });

  const missed = entries.filter((e) => e.status === 'missed').sort((a, b) => a.date.localeCompare(b.date));
  const next =
    entries.find((e) => e.status === 'today') ??
    entries.filter((e) => e.status === 'upcoming').sort((a, b) => a.date.localeCompare(b.date))[0] ??
    null;

  return { weekStart: input.weekStart, days, missed, next };
}

export type MissedOption =
  | {
      kind: 'move';
      /** Where the missed session goes. */
      targetDate: string;
      /** Today's own session, moved out of the way to a free day, when the missed one takes its place. */
      shift: { plannedSessionId: string; sessionName: string; targetDate: string } | null;
      label: string;
      reason: string;
    }
  | { kind: 'merge'; intoPlannedSessionId: string; intoName: string; label: string; reason: string }
  | { kind: 'skip'; label: string; reason: string };

export interface SuggestOptionsInput {
  schedule: WeekSchedule;
  missed: ScheduleEntry;
  today: string;
  /** exerciseId -> primary muscle-group keys, for the merge reason. */
  primaryMusclesByExercise?: Readonly<Record<string, readonly string[]>>;
  muscleNames?: Readonly<Record<string, string>>;
}

/** Merging past this many exercises makes one session too long to recommend. */
export const MAX_MERGED_EXERCISES = 8;

function dayName(date: string, today: string): string {
  if (date === today) return 'today';
  return WEEKDAY_SHORT[weekdayOf(date)];
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * FR-2.6: options for one missed session, best first: fit it in on a free
 * day (today if possible), merge it into the next session if the result
 * stays a reasonable length, or skip it. Skip is always offered.
 */
export function suggestMissedSessionOptions(input: SuggestOptionsInput): MissedOption[] {
  const { schedule, missed, today } = input;
  const options: MissedOption[] = [];
  const freeDays = schedule.days.filter((d) => d.date >= today && d.entries.length === 0).map((d) => d.date);
  const todayDay = schedule.days.find((d) => d.date === today);
  const todayEntry = todayDay?.entries.find((e) => e.status === 'today') ?? null;
  const todayDone = todayDay?.entries.some((e) => e.status === 'done') ?? false;

  // 1. Fit it in on a free day.
  if (todayDay && todayDay.entries.length === 0) {
    options.push({
      kind: 'move',
      targetDate: today,
      shift: null,
      label: 'Do it today',
      reason: 'Today is a rest day, so it fits without changing the rest of your week.',
    });
  } else if (todayEntry && !todayDone) {
    const laterFree = freeDays.find((d) => d > today);
    if (laterFree) {
      options.push({
        kind: 'move',
        targetDate: today,
        shift: { plannedSessionId: todayEntry.session.id, sessionName: todayEntry.session.name, targetDate: laterFree },
        label: 'Do it today',
        reason: `Do ${missed.session.name} today and move ${todayEntry.session.name} to ${dayName(laterFree, today)}, your next free day, so you still do every session this week.`,
      });
    }
  } else {
    const laterFree = freeDays.find((d) => d > today);
    if (laterFree) {
      options.push({
        kind: 'move',
        targetDate: laterFree,
        shift: null,
        label: `Do it ${dayName(laterFree, today)}`,
        reason: `${dayName(laterFree, today)} is your next free day, so it fits without moving anything else.`,
      });
    }
  }

  // 2. Merge into the next session that hasn't been done and isn't already a merge.
  const target = schedule.days
    .flatMap((d) => d.entries)
    .filter((e) => (e.status === 'today' || e.status === 'upcoming') && e.mergedFrom.length === 0 && e.session.id !== missed.session.id)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (target) {
    const added = missed.session.exerciseIds.filter((id) => !target.session.exerciseIds.includes(id));
    const total = target.session.exerciseIds.length + added.length;
    if (total <= MAX_MERGED_EXERCISES) {
      const muscles = input.primaryMusclesByExercise ?? {};
      const targetMuscles = new Set(target.session.exerciseIds.flatMap((id) => muscles[id] ?? []));
      const shared = [...new Set(added.flatMap((id) => muscles[id] ?? []))].filter((key) => targetMuscles.has(key));
      const sharedNames = shared.map((key) => (input.muscleNames?.[key] ?? key).toLowerCase());
      const when = dayName(target.date, today);
      options.push({
        kind: 'merge',
        intoPlannedSessionId: target.session.id,
        intoName: target.session.name,
        label: `Merge into ${when === 'today' ? "today's session" : when}`,
        reason:
          added.length === 0
            ? `${target.session.name} already covers the same exercises, so you lose nothing by folding it in.`
            : `Adds ${added.length} ${added.length === 1 ? 'exercise' : 'exercises'} to ${target.session.name} (${total} in total)${
                sharedNames.length > 0
                  ? `. Both work your ${joinNames(sharedNames.slice(0, 3))}, so expect a harder session.`
                  : ', and they work different muscles, so it stays balanced.'
              }`,
      });
    }
  }

  // 3. Skip.
  options.push({
    kind: 'skip',
    label: 'Skip it',
    reason: 'Carry on with the rest of your week as planned. Your progression is unaffected; you just do one session fewer.',
  });

  return options;
}
