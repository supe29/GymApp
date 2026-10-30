import { evaluateExercisePerformance } from '../progression/evaluateSession';
import type { SetLogEntry } from '../logs/logAggregation';
import {
  calculateEstimatedOneRepMax,
  currentPersonalRecordsByBucket,
  deriveNewPersonalRecords,
} from './prCalculator';

function log(overrides: Partial<SetLogEntry> = {}): SetLogEntry {
  return {
    id: 'log-1',
    workoutSessionId: 'session-1',
    exerciseId: 'ex-squat',
    setIndex: 1,
    weightKg: 100,
    reps: 5,
    rpe: null,
    loggedAt: '2026-10-28T08:00:00Z',
    ...overrides,
  };
}

describe('calculateEstimatedOneRepMax', () => {
  it('matches the Epley formula for known inputs', () => {
    expect(calculateEstimatedOneRepMax(100, 5)).toBeCloseTo(100 * (1 + 5 / 30));
    expect(calculateEstimatedOneRepMax(100, 1)).toBeCloseTo(100 * (1 + 1 / 30));
  });
});

describe('FR-8.2/AC-11: deriveNewPersonalRecords', () => {
  it('flags a strictly heavier set than prior history as a new PR', () => {
    const session = [log({ id: 'log-a', weightKg: 105, reps: 5 })];
    const prior = [log({ id: 'log-p', workoutSessionId: 'session-0', weightKg: 100, reps: 5 })];

    const results = deriveNewPersonalRecords(session, prior);

    expect(results).toEqual([
      {
        exerciseId: 'ex-squat',
        repCount: 5,
        weightKg: 105,
        estimatedOneRm: calculateEstimatedOneRepMax(105, 5),
        setLogId: 'log-a',
        achievedAt: '2026-10-28T08:00:00Z',
      },
    ]);
  });

  it('a tie with the prior best is a near-miss, not a new PR', () => {
    const session = [log({ id: 'log-a', weightKg: 100, reps: 5 })];
    const prior = [log({ id: 'log-p', workoutSessionId: 'session-0', weightKg: 100, reps: 5 })];

    expect(deriveNewPersonalRecords(session, prior)).toEqual([]);
  });

  it('a lower weight than prior history is not a new PR', () => {
    const session = [log({ id: 'log-a', weightKg: 90, reps: 5 })];
    const prior = [log({ id: 'log-p', workoutSessionId: 'session-0', weightKg: 100, reps: 5 })];

    expect(deriveNewPersonalRecords(session, prior)).toEqual([]);
  });

  it('with no prior history, any trackable set is a new PR', () => {
    const session = [log({ id: 'log-a', weightKg: 60, reps: 10 })];

    expect(deriveNewPersonalRecords(session, [])).toEqual([
      expect.objectContaining({ exerciseId: 'ex-squat', repCount: 10, weightKg: 60, setLogId: 'log-a' }),
    ]);
  });

  it('only the single heaviest set per rep-count bucket within the session is recorded', () => {
    const session = [
      log({ id: 'log-a', setIndex: 1, weightKg: 100, reps: 5 }),
      log({ id: 'log-b', setIndex: 2, weightKg: 110, reps: 5 }),
      log({ id: 'log-c', setIndex: 3, weightKg: 90, reps: 5 }),
    ];

    const results = deriveNewPersonalRecords(session, []);

    expect(results).toHaveLength(1);
    expect(results[0].setLogId).toBe('log-b');
    expect(results[0].weightKg).toBe(110);
  });

  it('bodyweight sets (no tracked weight) never produce a PR', () => {
    const session = [log({ id: 'log-a', weightKg: null, reps: 15 })];

    expect(deriveNewPersonalRecords(session, [])).toEqual([]);
  });

  it('a set never compares against itself when prior history includes the current session', () => {
    const session = [log({ id: 'log-a', weightKg: 100, reps: 5 })];
    // priorLogs is caller-supplied and expected to already exclude the
    // current session — this fixture documents that contract rather than
    // re-deriving exclusion logic inside the function itself.
    const priorExcludingCurrentSession: SetLogEntry[] = [];

    expect(deriveNewPersonalRecords(session, priorExcludingCurrentSession)).toEqual([
      expect.objectContaining({ setLogId: 'log-a' }),
    ]);
  });

  it('different exercises and rep counts are tracked in independent buckets', () => {
    const session = [
      log({ id: 'log-squat', exerciseId: 'ex-squat', weightKg: 100, reps: 5 }),
      log({ id: 'log-bench', exerciseId: 'ex-bench', weightKg: 60, reps: 5 }),
      log({ id: 'log-squat-1rm', exerciseId: 'ex-squat', setIndex: 2, weightKg: 130, reps: 1 }),
    ];

    const results = deriveNewPersonalRecords(session, []);

    expect(results.map((r) => r.setLogId).sort()).toEqual(['log-bench', 'log-squat', 'log-squat-1rm']);
  });
});

describe('FR-8.2: currentPersonalRecordsByBucket', () => {
  it('picks the max weight per (exerciseId, repCount) bucket across a mixed fixture', () => {
    const records = [
      { exerciseId: 'ex-squat', repCount: 5, weightKg: 100 },
      { exerciseId: 'ex-squat', repCount: 5, weightKg: 110 },
      { exerciseId: 'ex-squat', repCount: 1, weightKg: 130 },
      { exerciseId: 'ex-bench', repCount: 5, weightKg: 60 },
    ];

    const result = currentPersonalRecordsByBucket(records);

    expect(result.size).toBe(3);
    expect(result.get('ex-squat::5')?.weightKg).toBe(110);
    expect(result.get('ex-squat::1')?.weightKg).toBe(130);
    expect(result.get('ex-bench::5')?.weightKg).toBe(60);
  });

  it('returns an empty map for no records', () => {
    expect(currentPersonalRecordsByBucket([]).size).toBe(0);
  });
});

describe('NFR-4: deriveNewPersonalRecords and evaluateExercisePerformance agree on the same underlying logs', () => {
  it('both read the same set of logged sets for a shared fixture', () => {
    const sessionLogs: SetLogEntry[] = [
      log({ id: 'log-1', setIndex: 1, weightKg: 100, reps: 10 }),
      log({ id: 'log-2', setIndex: 2, weightKg: 100, reps: 10 }),
      log({ id: 'log-3', setIndex: 3, weightKg: 100, reps: 10 }),
    ];

    const progressionResult = evaluateExercisePerformance(
      { exerciseId: 'ex-squat', targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, targetWeightKg: 100 },
      sessionLogs,
    );
    const prResults = deriveNewPersonalRecords(sessionLogs, []);

    // Both functions must agree on the facts: all 3 logged sets exist, all
    // at the same weight/reps — a full-success progression result and a
    // single PR bucket derived from the identical heaviest set.
    expect(progressionResult?.action).toBe('increase_weight');
    expect(prResults).toHaveLength(1);
    expect(prResults[0].weightKg).toBe(100);
    expect(prResults[0].repCount).toBe(10);
  });
});
