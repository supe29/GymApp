// FR-2.8: the plan laid out as a month calendar, and the DR-5 rule shared by
// the week and month views: days before the current plan version took effect
// are not attributed to it. Built from buildWeekSchedule (FR-2.5) one week at
// a time, so a session still counts as done if it was completed on any day of
// its own week, and month cells agree with the week view.

import { localDateString, startOfLocalWeek } from '../dates/localDate';
import {
  addDays,
  buildWeekSchedule,
  type CompletedSessionRecord,
  type ScheduleAdjustment,
  type ScheduleDay,
  type ScheduleSession,
  type WeekSchedule,
  type Weekday,
} from './weekSchedule';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The local date (YYYY-MM-DD) a plan version took effect, or null when unknown. */
export function planStartDate(effectiveFrom: string | null | undefined): string | null {
  if (!effectiveFrom) return null;
  if (DATE_ONLY.test(effectiveFrom)) return effectiveFrom;
  const parsed = new Date(effectiveFrom);
  return Number.isNaN(parsed.getTime()) ? null : localDateString(parsed);
}

/**
 * DR-5: drops the sessions a week schedule places before `startDate` (the
 * day the current plan version took effect). Those days belonged to an
 * earlier plan version, or to no plan, so they are neither missed nor
 * upcoming under this one.
 */
export function trimScheduleBefore(schedule: WeekSchedule, startDate: string | null): WeekSchedule {
  if (!startDate) return schedule;
  const keep = (date: string) => date >= startDate;
  const next = schedule.next && keep(schedule.next.date) ? schedule.next : null;
  return {
    weekStart: schedule.weekStart,
    days: schedule.days.map((day) => ({
      ...day,
      entries: day.entries.filter((e) => keep(e.date)),
    })),
    missed: schedule.missed.filter((e) => keep(e.date)),
    next,
  };
}

/** Year and month (1-12) `offset` months from the given one. */
export function shiftMonth(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  const shifted = new Date(year, month - 1 + offset, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() + 1 };
}

/** Monday (YYYY-MM-DD) of every week that has at least one day in the month: 4 to 6 weeks. */
export function monthGridWeeks(year: number, month: number): string[] {
  const lastDay = localDateString(new Date(year, month, 0));
  const weeks: string[] = [];
  for (
    let monday = localDateString(startOfLocalWeek(new Date(year, month - 1, 1)));
    monday <= lastDay;
    monday = addDays(monday, 7)
  ) {
    weeks.push(monday);
  }
  return weeks;
}

export interface DatedScheduleAdjustment extends ScheduleAdjustment {
  /** Monday of the week the choice belongs to. */
  weekStart: string;
}

export interface MonthDay extends ScheduleDay {
  /** False for the leading/trailing days of neighbouring months that fill the grid. */
  inMonth: boolean;
  /**
   * A workout was completed this day that none of this week's scheduled
   * sessions account for (an earlier plan version's session, or a session
   * done on a rest day), so the calendar can still mark it.
   */
  loggedWorkout: boolean;
}

export interface MonthSchedule {
  year: number;
  /** 1-12. */
  month: number;
  weeks: WeekSchedule[];
  /** Every grid day, Monday first, 28-42 of them. */
  days: MonthDay[];
}

export interface BuildMonthScheduleInput {
  sessions: ScheduleSession[];
  weekdays: Weekday[];
  year: number;
  /** 1-12. */
  month: number;
  /** Today, YYYY-MM-DD (local). */
  today: string;
  completed: CompletedSessionRecord[];
  adjustments: DatedScheduleAdjustment[];
  /** The local date the current plan version took effect (see planStartDate); null to project it onto every day. */
  planStart: string | null;
}

export function buildMonthSchedule(input: BuildMonthScheduleInput): MonthSchedule {
  const monthPrefix = `${input.year}-${String(input.month).padStart(2, '0')}-`;
  const weeks = monthGridWeeks(input.year, input.month).map((weekStart) =>
    trimScheduleBefore(
      buildWeekSchedule({
        sessions: input.sessions,
        weekdays: input.weekdays,
        weekStart,
        today: input.today,
        completed: input.completed,
        adjustments: input.adjustments.filter((a) => a.weekStart === weekStart),
      }),
      input.planStart,
    ),
  );

  const completedOn = new Map<string, (string | null)[]>();
  for (const record of input.completed) {
    const day = localDateString(new Date(record.completedAt));
    completedOn.set(day, [...(completedOn.get(day) ?? []), record.plannedSessionId]);
  }

  const days = weeks.flatMap((week) => {
    const scheduledIds = new Set(
      week.days.flatMap((d) =>
        d.entries.flatMap((e) => [e.session.id, ...e.mergedFrom.map((m) => m.id)]),
      ),
    );
    return week.days.map((day) => ({
      ...day,
      inMonth: day.date.startsWith(monthPrefix),
      loggedWorkout:
        day.entries.length === 0 &&
        (completedOn.get(day.date) ?? []).some((id) => id === null || !scheduledIds.has(id)),
    }));
  });

  return { year: input.year, month: input.month, weeks, days };
}
