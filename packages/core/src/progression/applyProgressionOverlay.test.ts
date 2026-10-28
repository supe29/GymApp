import {
  applyProgressionOverlay,
  effectiveSuggestionValue,
  type OverlayableExercise,
  type SuggestionLike,
} from './applyProgressionOverlay';

interface FakeExercise extends OverlayableExercise {
  id: string;
  exerciseName: string;
  targetRepsMax: number | null;
}

function exercise(overrides: Partial<FakeExercise> = {}): FakeExercise {
  return {
    id: 'pse-1',
    exerciseId: 'ex-1',
    exerciseName: 'Squat',
    targetWeightKg: 50,
    targetRepsMin: 8,
    targetRepsMax: 12,
    ...overrides,
  };
}

describe('effectiveSuggestionValue (FR-6.2)', () => {
  test('an accepted suggestion uses the originally suggested values', () => {
    const suggestion: SuggestionLike = {
      status: 'accepted',
      suggestedWeightKg: 52.5,
      suggestedReps: 8,
      overriddenWeightKg: null,
      overriddenReps: null,
    };
    expect(effectiveSuggestionValue(suggestion)).toEqual({ weightKg: 52.5, repsMin: 8 });
  });

  test('an overridden suggestion uses the user-provided override values, not the original suggestion', () => {
    const suggestion: SuggestionLike = {
      status: 'overridden',
      suggestedWeightKg: 52.5,
      suggestedReps: 8,
      overriddenWeightKg: 55,
      overriddenReps: 6,
    };
    expect(effectiveSuggestionValue(suggestion)).toEqual({ weightKg: 55, repsMin: 6 });
  });
});

describe('applyProgressionOverlay (FR-6.1)', () => {
  test('overrides targetWeightKg and targetRepsMin for a matching exercise', () => {
    const result = applyProgressionOverlay(
      [exercise()],
      new Map([['ex-1', { weightKg: 52.5, repsMin: 8 }]]),
    );
    expect(result[0].targetWeightKg).toBe(52.5);
    expect(result[0].targetRepsMin).toBe(8);
  });

  test('never touches targetRepsMax', () => {
    const result = applyProgressionOverlay(
      [exercise({ targetRepsMax: 12 })],
      new Map([['ex-1', { weightKg: 52.5, repsMin: 8 }]]),
    );
    expect(result[0].targetRepsMax).toBe(12);
  });

  test('leaves an exercise with no matching suggestion completely unchanged (same reference)', () => {
    const ex = exercise();
    const result = applyProgressionOverlay([ex], new Map([['ex-2', { weightKg: 100, repsMin: 1 }]]));
    expect(result[0]).toBe(ex);
  });

  test('preserves all other fields (id, exerciseName, etc.) untouched', () => {
    const result = applyProgressionOverlay(
      [exercise({ id: 'pse-42', exerciseName: 'Bench Press' })],
      new Map([['ex-1', { weightKg: 52.5, repsMin: 8 }]]),
    );
    expect(result[0].id).toBe('pse-42');
    expect(result[0].exerciseName).toBe('Bench Press');
  });

  test('a null effective value falls back to the original static target rather than becoming null', () => {
    const result = applyProgressionOverlay(
      [exercise({ targetWeightKg: 50, targetRepsMin: 8 })],
      new Map([['ex-1', { weightKg: null, repsMin: null }]]),
    );
    expect(result[0].targetWeightKg).toBe(50);
    expect(result[0].targetRepsMin).toBe(8);
  });

  test('handles multiple exercises, overlaying only the matching ones', () => {
    const result = applyProgressionOverlay(
      [exercise({ id: 'pse-1', exerciseId: 'ex-1' }), exercise({ id: 'pse-2', exerciseId: 'ex-2', targetWeightKg: 30 })],
      new Map([['ex-1', { weightKg: 52.5, repsMin: 8 }]]),
    );
    expect(result[0].targetWeightKg).toBe(52.5);
    expect(result[1].targetWeightKg).toBe(30);
  });
});
