import {
  buildWeekSchedule,
  defaultWeekdays,
  suggestMissedSessionOptions,
  validWeekdays,
  type BuildWeekScheduleInput,
  type ScheduleSession,
} from './weekSchedule';

// Week of Monday 9 Nov 2026. Plan: A, B, C on Mon/Wed/Fri.
const A: ScheduleSession = { id: 'A', dayOrder: 1, name: 'Full Body A', exerciseIds: ['squat', 'bench', 'row'] };
const B: ScheduleSession = { id: 'B', dayOrder: 2, name: 'Full Body B', exerciseIds: ['deadlift', 'press', 'pullup'] };
const C: ScheduleSession = { id: 'C', dayOrder: 3, name: 'Full Body C', exerciseIds: ['lunge', 'dip', 'curl'] };

function input(overrides: Partial<BuildWeekScheduleInput> = {}): BuildWeekScheduleInput {
  return {
    sessions: [C, A, B],
    weekdays: [1, 3, 5],
    weekStart: '2026-11-09',
    today: '2026-11-11', // Wednesday
    completed: [],
    adjustments: [],
    ...overrides,
  };
}

// Noon local time on a given day, as an ISO timestamp.
const at = (date: string) => new Date(`${date}T12:00:00`).toISOString();

describe('defaultWeekdays / validWeekdays', () => {
  test('spreads 1-7 sessions across the week', () => {
    expect(defaultWeekdays(3)).toEqual([1, 3, 5]);
    expect(defaultWeekdays(4)).toEqual([1, 2, 4, 5]);
    for (let n = 1; n <= 7; n++) expect(defaultWeekdays(n)).toHaveLength(n);
  });

  test('accepts only sorted-unique 1-7 days of the right count', () => {
    expect(validWeekdays([5, 1, 3], 3)).toEqual([1, 3, 5]);
    expect(validWeekdays([1, 3], 3)).toBeNull();
    expect(validWeekdays([1, 1, 3], 3)).toBeNull();
    expect(validWeekdays([0, 3, 5], 3)).toBeNull();
    expect(validWeekdays(null, 3)).toBeNull();
  });
});

describe('FR-2.5: buildWeekSchedule', () => {
  test('puts plan day N on the Nth chosen weekday, in day order, with rest days empty', () => {
    const week = buildWeekSchedule(input());
    expect(week.days.map((d) => [d.date, d.entries.map((e) => e.session.id)])).toEqual([
      ['2026-11-09', ['A']],
      ['2026-11-10', []],
      ['2026-11-11', ['B']],
      ['2026-11-12', []],
      ['2026-11-13', ['C']],
      ['2026-11-14', []],
      ['2026-11-15', []],
    ]);
  });

  test('past and not done is missed; today is today; later is upcoming', () => {
    const week = buildWeekSchedule(input());
    expect(week.days[0].entries[0].status).toBe('missed');
    expect(week.days[2].entries[0].status).toBe('today');
    expect(week.days[4].entries[0].status).toBe('upcoming');
    expect(week.missed.map((e) => e.session.id)).toEqual(['A']);
    expect(week.next?.session.id).toBe('B');
  });

  test('a session completed on another day of the same week counts as done', () => {
    const week = buildWeekSchedule(input({ completed: [{ plannedSessionId: 'A', completedAt: at('2026-11-10') }] }));
    expect(week.days[0].entries[0].status).toBe('done');
    expect(week.missed).toEqual([]);
  });

  test('a completion from another week does not count', () => {
    const week = buildWeekSchedule(input({ completed: [{ plannedSessionId: 'A', completedAt: at('2026-11-06') }] }));
    expect(week.days[0].entries[0].status).toBe('missed');
  });

  test('a moved session shows on its new day and remembers where it came from', () => {
    const week = buildWeekSchedule(
      input({ adjustments: [{ plannedSessionId: 'A', action: 'move', targetDate: '2026-11-12', mergeIntoPlannedSessionId: null }] }),
    );
    expect(week.days[0].entries).toEqual([]);
    expect(week.days[3].entries[0]).toMatchObject({ session: { id: 'A' }, status: 'upcoming', movedFrom: '2026-11-09' });
    expect(week.missed).toEqual([]);
  });

  test('a skipped session is skipped, not missed', () => {
    const week = buildWeekSchedule(input({ adjustments: [{ plannedSessionId: 'A', action: 'skip', targetDate: null, mergeIntoPlannedSessionId: null }] }));
    expect(week.days[0].entries[0].status).toBe('skipped');
    expect(week.missed).toEqual([]);
  });

  test('a merged session rides along with its target and is done when the target is done', () => {
    const merge = { plannedSessionId: 'A', action: 'merge' as const, targetDate: null, mergeIntoPlannedSessionId: 'B' };
    let week = buildWeekSchedule(input({ adjustments: [merge] }));
    expect(week.days[0].entries).toEqual([]);
    expect(week.days[2].entries[0].mergedFrom.map((s) => s.id)).toEqual(['A']);

    week = buildWeekSchedule(input({ adjustments: [merge], completed: [{ plannedSessionId: 'B', completedAt: at('2026-11-11') }] }));
    expect(week.days[0].entries[0]).toMatchObject({ session: { id: 'A' }, status: 'done' });
  });

  test('next is null once the week is finished', () => {
    const week = buildWeekSchedule(input({ today: '2026-11-15' }));
    expect(week.next).toBeNull();
    expect(week.missed.map((e) => e.session.id)).toEqual(['A', 'B', 'C']);
  });
});

describe('FR-2.6: suggestMissedSessionOptions', () => {
  function options(overrides: Partial<BuildWeekScheduleInput> = {}, extra = {}) {
    const schedule = buildWeekSchedule(input(overrides));
    return suggestMissedSessionOptions({ schedule, missed: schedule.missed[0], today: schedule.days.find((d) => d.date === (overrides.today ?? '2026-11-11'))!.date, ...extra });
  }

  test('on a rest day, recommends doing it today with nothing else moving', () => {
    const [first] = options({ today: '2026-11-10' });
    expect(first).toMatchObject({ kind: 'move', targetDate: '2026-11-10', shift: null, label: 'Do it today' });
  });

  test("on a training day, recommends doing it today and moving today's session to the next free day", () => {
    const [first] = options();
    expect(first).toMatchObject({
      kind: 'move',
      targetDate: '2026-11-11',
      shift: { plannedSessionId: 'B', targetDate: '2026-11-12' },
    });
    expect(first.reason).toContain('move Full Body B to Thu');
  });

  test("when today's session is already done, suggests the next free day instead", () => {
    const [first] = options({ completed: [{ plannedSessionId: 'B', completedAt: at('2026-11-11') }] });
    expect(first).toMatchObject({ kind: 'move', targetDate: '2026-11-12', label: 'Do it Thu' });
  });

  test('offers a merge into the next session while it stays at 8 exercises or fewer, and explains shared muscles', () => {
    const opts = options({}, {
      primaryMusclesByExercise: { squat: ['quadriceps'], deadlift: ['hamstrings', 'quadriceps'] },
      muscleNames: { quadriceps: 'Quadriceps' },
    });
    const merge = opts.find((o) => o.kind === 'merge');
    expect(merge).toMatchObject({ intoPlannedSessionId: 'B', label: "Merge into today's session" });
    expect(merge?.reason).toContain('Adds 3 exercises to Full Body B (6 in total)');
    expect(merge?.reason).toContain('Both work your quadriceps');
  });

  test('does not offer a merge that would exceed 8 exercises', () => {
    const big = { ...B, exerciseIds: ['a', 'b', 'c', 'd', 'e', 'f'] };
    const opts = options({ sessions: [A, big, C] });
    expect(opts.some((o) => o.kind === 'merge')).toBe(false);
  });

  test('always offers skip, last', () => {
    const opts = options();
    expect(opts[opts.length - 1].kind).toBe('skip');
  });

  test('with today done and no free days left this week, only skip remains', () => {
    // Mon/Wed/Sun; today is Sunday and its session is done.
    const opts = options({ weekdays: [1, 3, 7], today: '2026-11-15', completed: [{ plannedSessionId: 'C', completedAt: at('2026-11-15') }] });
    expect(opts.map((o) => o.kind)).toEqual(['skip']);
  });
});
