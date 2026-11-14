import {
  buildMonthSchedule,
  monthGridWeeks,
  planStartDate,
  shiftMonth,
  trimScheduleBefore,
  type BuildMonthScheduleInput,
} from './monthSchedule';
import { buildWeekSchedule, type ScheduleSession } from './weekSchedule';

const A: ScheduleSession = { id: 'A', dayOrder: 1, name: 'Push', exerciseIds: ['bench'] };
const B: ScheduleSession = { id: 'B', dayOrder: 2, name: 'Pull', exerciseIds: ['row'] };
const C: ScheduleSession = { id: 'C', dayOrder: 3, name: 'Legs', exerciseIds: ['squat'] };

const at = (date: string, hour = 12) =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).toISOString();

function input(overrides: Partial<BuildMonthScheduleInput> = {}): BuildMonthScheduleInput {
  return {
    sessions: [A, B, C],
    weekdays: [1, 3, 5],
    year: 2026,
    month: 11,
    today: '2026-11-11', // Wednesday
    completed: [],
    adjustments: [],
    planStart: null,
    ...overrides,
  };
}

function day(schedule: ReturnType<typeof buildMonthSchedule>, date: string) {
  const found = schedule.days.find((d) => d.date === date);
  if (!found) throw new Error(`no grid day ${date}`);
  return found;
}

describe('monthGridWeeks', () => {
  test('November 2026 starts on a Sunday, so the grid begins the Monday before and runs 6 weeks', () => {
    expect(monthGridWeeks(2026, 11)).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  test('a 28-day February starting on Monday fits in exactly 4 weeks', () => {
    expect(monthGridWeeks(2027, 2)).toEqual([
      '2027-02-01',
      '2027-02-08',
      '2027-02-15',
      '2027-02-22',
    ]);
  });

  test('a leap February includes the 29th', () => {
    const weeks = monthGridWeeks(2028, 2);
    expect(weeks[weeks.length - 1] <= '2028-02-29').toBe(true);
    expect(weeks).toContain('2028-02-28');
  });

  test('a month starting on Monday does not get a leading week', () => {
    expect(monthGridWeeks(2026, 6)[0]).toBe('2026-06-01');
  });
});

describe('shiftMonth / planStartDate', () => {
  test('shifts across year boundaries', () => {
    expect(shiftMonth(2026, 11, 2)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 11, 0)).toEqual({ year: 2026, month: 11 });
  });

  test('reads a timestamp as its local date, keeps a plain date, and treats blanks as unknown', () => {
    expect(planStartDate(at('2026-11-04', 9))).toBe('2026-11-04');
    expect(planStartDate('2026-11-04')).toBe('2026-11-04');
    expect(planStartDate('')).toBeNull();
    expect(planStartDate(null)).toBeNull();
    expect(planStartDate('not a date')).toBeNull();
  });
});

describe('buildMonthSchedule (FR-2.8)', () => {
  test('marks grid days outside the month and covers every week', () => {
    const month = buildMonthSchedule(input());
    expect(month.days).toHaveLength(42);
    expect(month.weeks).toHaveLength(6);
    expect(day(month, '2026-10-26').inMonth).toBe(false);
    expect(day(month, '2026-11-01').inMonth).toBe(true);
    expect(day(month, '2026-11-30').inMonth).toBe(true);
    expect(day(month, '2026-12-06').inMonth).toBe(false);
  });

  test('puts each session on its weekday with past, today and future statuses', () => {
    const month = buildMonthSchedule(input());
    expect(day(month, '2026-11-02').entries[0]).toMatchObject({
      session: { name: 'Push' },
      status: 'missed',
    });
    expect(day(month, '2026-11-11').entries[0]).toMatchObject({
      session: { name: 'Pull' },
      status: 'today',
    });
    expect(day(month, '2026-11-20').entries[0]).toMatchObject({
      session: { name: 'Legs' },
      status: 'upcoming',
    });
    expect(day(month, '2026-11-03').entries).toHaveLength(0);
  });

  test('a session counts as done only in the week it was completed', () => {
    const month = buildMonthSchedule(
      input({ completed: [{ plannedSessionId: 'A', completedAt: at('2026-11-03') }] }),
    );
    expect(day(month, '2026-11-02').entries[0].status).toBe('done');
    expect(day(month, '2026-11-09').entries[0].status).toBe('missed');
    // Done on Tuesday, already shown as done on Monday: not double-marked.
    expect(day(month, '2026-11-03').loggedWorkout).toBe(false);
  });

  test('routes each adjustment to its own week only', () => {
    const month = buildMonthSchedule(
      input({
        adjustments: [
          {
            weekStart: '2026-11-09',
            plannedSessionId: 'A',
            action: 'skip',
            targetDate: null,
            mergeIntoPlannedSessionId: null,
          },
        ],
      }),
    );
    expect(day(month, '2026-11-09').entries[0].status).toBe('skipped');
    expect(day(month, '2026-11-02').entries[0].status).toBe('missed');
    expect(day(month, '2026-11-16').entries[0].status).toBe('upcoming');
  });

  test('DR-5: days before the plan took effect are not attributed to it, but a workout logged then is still marked', () => {
    const month = buildMonthSchedule(
      input({
        planStart: '2026-11-04',
        completed: [{ plannedSessionId: 'old-plan-session', completedAt: at('2026-11-02') }],
      }),
    );
    expect(day(month, '2026-10-30').entries).toHaveLength(0);
    expect(day(month, '2026-11-02').entries).toHaveLength(0);
    expect(day(month, '2026-11-02').loggedWorkout).toBe(true);
    expect(day(month, '2026-11-04').entries[0]).toMatchObject({
      session: { name: 'Pull' },
      status: 'missed',
    });
  });

  test('an unplanned workout on a rest day is marked', () => {
    const month = buildMonthSchedule(
      input({ completed: [{ plannedSessionId: null, completedAt: at('2026-11-07') }] }),
    );
    expect(day(month, '2026-11-07').loggedWorkout).toBe(true);
    expect(day(month, '2026-11-08').loggedWorkout).toBe(false);
  });
});

describe('trimScheduleBefore', () => {
  const week = buildWeekSchedule({
    sessions: [A, B, C],
    weekdays: [1, 3, 5],
    weekStart: '2026-11-09',
    today: '2026-11-11',
    completed: [],
    adjustments: [],
  });

  test('leaves the week alone without a start date', () => {
    expect(trimScheduleBefore(week, null)).toBe(week);
  });

  test('drops earlier sessions from days, missed and next', () => {
    const trimmed = trimScheduleBefore(week, '2026-11-11');
    expect(trimmed.days[0].entries).toHaveLength(0);
    expect(trimmed.missed).toHaveLength(0);
    expect(trimmed.next?.session.id).toBe('B');
    expect(trimScheduleBefore(week, '2026-11-14').next).toBeNull();
  });
});
