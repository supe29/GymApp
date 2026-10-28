import {
  filterByExercise,
  filterBySession,
  groupBySession,
  mostRecentCompletedSessionLogs,
  sortByLoggedAt,
  type SetLogEntry,
  type WorkoutSessionSummary,
} from './logAggregation';

function log(partial: Partial<SetLogEntry> & { id: string }): SetLogEntry {
  return {
    id: partial.id,
    workoutSessionId: partial.workoutSessionId ?? 'session-1',
    exerciseId: partial.exerciseId ?? 'ex-1',
    setIndex: partial.setIndex ?? 1,
    weightKg: partial.weightKg ?? 50,
    reps: partial.reps ?? 10,
    rpe: partial.rpe ?? null,
    loggedAt: partial.loggedAt ?? '2026-01-01T00:00:00Z',
  };
}

function session(partial: Partial<WorkoutSessionSummary> & { id: string }): WorkoutSessionSummary {
  return {
    id: partial.id,
    plannedSessionId: partial.plannedSessionId ?? null,
    workoutPlanId: partial.workoutPlanId ?? null,
    status: partial.status ?? 'completed',
    startedAt: partial.startedAt ?? '2026-01-01T00:00:00Z',
    completedAt: partial.completedAt ?? '2026-01-01T01:00:00Z',
  };
}

describe('filterByExercise / filterBySession (FR-5.1/NFR-4)', () => {
  const logs = [
    log({ id: 'l1', exerciseId: 'ex-1', workoutSessionId: 's1' }),
    log({ id: 'l2', exerciseId: 'ex-2', workoutSessionId: 's1' }),
    log({ id: 'l3', exerciseId: 'ex-1', workoutSessionId: 's2' }),
  ];

  test('filterByExercise returns only matching logs', () => {
    expect(filterByExercise(logs, 'ex-1').map((l) => l.id).sort()).toEqual(['l1', 'l3']);
  });

  test('filterBySession returns only matching logs', () => {
    expect(filterBySession(logs, 's1').map((l) => l.id).sort()).toEqual(['l1', 'l2']);
  });
});

describe('groupBySession (NFR-4)', () => {
  test('groups logs by their owning session', () => {
    const logs = [
      log({ id: 'l1', workoutSessionId: 's1' }),
      log({ id: 'l2', workoutSessionId: 's1' }),
      log({ id: 'l3', workoutSessionId: 's2' }),
    ];
    const groups = groupBySession(logs);
    expect(groups.size).toBe(2);
    expect(groups.get('s1')?.map((l) => l.id).sort()).toEqual(['l1', 'l2']);
    expect(groups.get('s2')?.map((l) => l.id)).toEqual(['l3']);
  });
});

describe('sortByLoggedAt (NFR-4)', () => {
  test('sorts chronologically, oldest first, without mutating the input', () => {
    const logs = [
      log({ id: 'l1', loggedAt: '2026-01-03T00:00:00Z' }),
      log({ id: 'l2', loggedAt: '2026-01-01T00:00:00Z' }),
      log({ id: 'l3', loggedAt: '2026-01-02T00:00:00Z' }),
    ];
    const sorted = sortByLoggedAt(logs);
    expect(sorted.map((l) => l.id)).toEqual(['l2', 'l3', 'l1']);
    expect(logs.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
  });
});

describe('mostRecentCompletedSessionLogs (NFR-4)', () => {
  test('returns the logs from the most recent completed session that logged the exercise', () => {
    const sessions = [
      session({ id: 's1', completedAt: '2026-01-01T00:00:00Z' }),
      session({ id: 's2', completedAt: '2026-01-05T00:00:00Z' }),
    ];
    const logs = [
      log({ id: 'l1', workoutSessionId: 's1', exerciseId: 'ex-1', setIndex: 1 }),
      log({ id: 'l2', workoutSessionId: 's2', exerciseId: 'ex-1', setIndex: 1 }),
      log({ id: 'l3', workoutSessionId: 's2', exerciseId: 'ex-1', setIndex: 2 }),
    ];
    const result = mostRecentCompletedSessionLogs(logs, sessions, 'ex-1');
    expect(result.map((l) => l.id)).toEqual(['l2', 'l3']);
  });

  test('ignores in_progress sessions even if more recent', () => {
    const sessions = [
      session({ id: 's1', status: 'completed', completedAt: '2026-01-01T00:00:00Z' }),
      session({ id: 's2', status: 'in_progress', completedAt: null }),
    ];
    const logs = [
      log({ id: 'l1', workoutSessionId: 's1', exerciseId: 'ex-1' }),
      log({ id: 'l2', workoutSessionId: 's2', exerciseId: 'ex-1' }),
    ];
    const result = mostRecentCompletedSessionLogs(logs, sessions, 'ex-1');
    expect(result.map((l) => l.id)).toEqual(['l1']);
  });

  test('returns an empty array when no completed session ever logged the exercise', () => {
    const sessions = [session({ id: 's1' })];
    const logs = [log({ id: 'l1', workoutSessionId: 's1', exerciseId: 'ex-other' })];
    expect(mostRecentCompletedSessionLogs(logs, sessions, 'ex-1')).toEqual([]);
  });

  test('NFR-4: two independently-composed query paths over the same data produce the same result set', () => {
    const sessions = [
      session({ id: 's1', completedAt: '2026-01-01T00:00:00Z' }),
      session({ id: 's2', completedAt: '2026-01-05T00:00:00Z' }),
      session({ id: 's3', status: 'in_progress', completedAt: null }),
    ];
    const logs = [
      log({ id: 'l1', workoutSessionId: 's1', exerciseId: 'ex-1', setIndex: 1 }),
      log({ id: 'l2', workoutSessionId: 's2', exerciseId: 'ex-1', setIndex: 1 }),
      log({ id: 'l3', workoutSessionId: 's2', exerciseId: 'ex-1', setIndex: 2 }),
      log({ id: 'l4', workoutSessionId: 's2', exerciseId: 'ex-2', setIndex: 1 }),
      log({ id: 'l5', workoutSessionId: 's3', exerciseId: 'ex-1', setIndex: 1 }),
    ];

    // Path A ("Phase 8 style"): filter-by-exercise first, then group by session.
    const pathA = Array.from(groupBySession(filterByExercise(logs, 'ex-1')).entries())
      .filter(([sessionId]) => sessions.find((s) => s.id === sessionId)?.status === 'completed')
      .sort(
        ([aId], [bId]) =>
          Date.parse(sessions.find((s) => s.id === bId)!.completedAt!) -
          Date.parse(sessions.find((s) => s.id === aId)!.completedAt!),
      )[0][1]
      .map((l) => l.id)
      .sort();

    // Path B ("Phase 10 style"): group by session first, then filter each group by exercise.
    const completedSessionsSortedDesc = sessions
      .filter((s) => s.status === 'completed')
      .sort((a, b) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!));
    const grouped = groupBySession(logs);
    const pathB = filterByExercise(grouped.get(completedSessionsSortedDesc[0].id) ?? [], 'ex-1')
      .map((l) => l.id)
      .sort();

    const viaSharedModule = mostRecentCompletedSessionLogs(logs, sessions, 'ex-1')
      .map((l) => l.id)
      .sort();

    expect(pathA).toEqual(pathB);
    expect(pathA).toEqual(viaSharedModule);
  });
});
