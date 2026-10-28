import type { SetLogEntry } from '../logs/logAggregation';
import { evaluateExercisePerformance, type ExercisePrescription } from './evaluateSession';

function log(setIndex: number, reps: number | null): SetLogEntry {
  return {
    id: `log-${setIndex}`,
    workoutSessionId: 'session-1',
    exerciseId: 'ex-1',
    setIndex,
    weightKg: 50,
    reps,
    rpe: null,
    loggedAt: '2026-01-01T00:00:00Z',
  };
}

function prescription(overrides: Partial<ExercisePrescription> = {}): ExercisePrescription {
  return {
    exerciseId: 'ex-1',
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetWeightKg: 50,
    ...overrides,
  };
}

describe('evaluateExercisePerformance (FR-6.1/SR-4/AC-6/AC-7)', () => {
  test('returns null when nothing was logged for this exercise', () => {
    expect(evaluateExercisePerformance(prescription(), [])).toBeNull();
  });

  test('AC-6: full success with a tracked weight suggests a weight increase and resets reps to the floor', () => {
    const result = evaluateExercisePerformance(prescription(), [log(1, 12), log(2, 12), log(3, 12)]);
    expect(result).toEqual({
      action: 'increase_weight',
      suggestedWeightKg: 52.5,
      suggestedReps: 8,
      rationale: expect.stringContaining('12+ reps'),
    });
  });

  test('full success with no tracked weight (bodyweight) suggests more reps instead', () => {
    const result = evaluateExercisePerformance(
      prescription({ targetWeightKg: null }),
      [log(1, 12), log(2, 12), log(3, 12)],
    );
    expect(result).toEqual({
      action: 'increase_reps',
      suggestedWeightKg: null,
      suggestedReps: 13,
      rationale: expect.stringContaining('12+ reps'),
    });
  });

  test('partial success (floor met, ceiling not reached) suggests one more rep, weight untouched', () => {
    const result = evaluateExercisePerformance(prescription(), [log(1, 10), log(2, 9), log(3, 8)]);
    expect(result).toEqual({
      action: 'increase_reps',
      suggestedWeightKg: null,
      suggestedReps: 9,
      rationale: expect.stringContaining("didn't reach the top"),
    });
  });

  test('AC-7/SR-4: a single missed set (below the floor) holds, even if the other sets were perfect', () => {
    const result = evaluateExercisePerformance(prescription(), [log(1, 12), log(2, 12), log(3, 5)]);
    expect(result?.action).toBe('hold');
    expect(result?.suggestedWeightKg).toBe(50);
    expect(result?.suggestedReps).toBeNull();
  });

  test('SR-4: a set that was never logged at all counts as a miss (fewer than targetSets completed)', () => {
    const result = evaluateExercisePerformance(prescription(), [log(1, 12), log(2, 12)]);
    expect(result?.action).toBe('hold');
  });

  test('a null reps value on a logged set counts as a miss', () => {
    const result = evaluateExercisePerformance(prescription(), [log(1, 12), log(2, null), log(3, 12)]);
    expect(result?.action).toBe('hold');
  });

  test('an exact-rep prescription (no range) treats hitting the single target as full success', () => {
    const result = evaluateExercisePerformance(
      prescription({ targetRepsMin: 5, targetRepsMax: null }),
      [log(1, 5), log(2, 5), log(3, 5)],
    );
    expect(result?.action).toBe('increase_weight');
  });

  test('SR-4 regression: no fixture with any missed set across a wide combinatorial sweep ever suggests an increase', () => {
    const repsOptions = [null, 0, 3, 5, 7, 8, 9, 10, 11, 12, 13];
    for (const r1 of repsOptions) {
      for (const r2 of repsOptions) {
        for (const r3 of repsOptions) {
          const hadAMiss = [r1, r2, r3].some((r) => r === null || r < 8);
          if (!hadAMiss) continue;
          const result = evaluateExercisePerformance(prescription(), [log(1, r1), log(2, r2), log(3, r3)]);
          expect(result?.action).toBe('hold');
        }
      }
    }
  });

  test('is deterministic: identical input always produces an identical result', () => {
    const input: [ExercisePrescription, SetLogEntry[]] = [prescription(), [log(1, 12), log(2, 12), log(3, 12)]];
    expect(evaluateExercisePerformance(...input)).toEqual(evaluateExercisePerformance(...input));
  });
});
