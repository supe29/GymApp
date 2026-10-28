import type { ExerciseWithTags } from '../../content/exerciseQueries';
import { selectExerciseForSlot } from './difficultyGating';

function exercise(id: string, difficulty: ExerciseWithTags['difficulty']): ExerciseWithTags {
  return {
    id,
    name: id,
    instructions: null,
    difficulty,
    primaryMuscleKeys: ['chest'],
    secondaryMuscleKeys: [],
    requiredEquipmentKeys: [],
  };
}

const beginnerEx = exercise('beg-1', 'beginner');
const intermediateEx = exercise('int-1', 'intermediate');
const advancedEx = exercise('adv-1', 'advanced');
const advancedEx2 = exercise('adv-2', 'advanced');

describe('selectExerciseForSlot (SR-3)', () => {
  test('returns null for an empty pool', () => {
    expect(selectExerciseForSlot([], 'beginner')).toBeNull();
  });

  test('intermediate users are never gated: top candidate wins even if it is advanced', () => {
    const result = selectExerciseForSlot([advancedEx, beginnerEx], 'intermediate');
    expect(result).not.toBeNull();
    expect(result?.exercise.id).toBe('adv-1');
    expect(result?.gateApplied).toBe(false);
    expect(result?.usedAdvancedFallback).toBe(false);
  });

  test('advanced users are never gated: top candidate wins even if it is advanced', () => {
    const result = selectExerciseForSlot([advancedEx, beginnerEx], 'advanced');
    expect(result?.exercise.id).toBe('adv-1');
    expect(result?.gateApplied).toBe(false);
  });

  test('beginner with a mixed pool picks the safer (non-advanced) candidate, flags the gate', () => {
    const result = selectExerciseForSlot([advancedEx, intermediateEx], 'beginner');
    expect(result?.exercise.id).toBe('int-1');
    expect(result?.gateApplied).toBe(true);
    expect(result?.avoidedAdvancedExerciseIds).toEqual(['adv-1']);
    expect(result?.usedAdvancedFallback).toBe(false);
  });

  test('beginner with an advanced-only pool falls back to the advanced candidate (no safer alternative exists)', () => {
    const result = selectExerciseForSlot([advancedEx, advancedEx2], 'beginner');
    expect(result?.exercise.id).toBe('adv-1');
    expect(result?.gateApplied).toBe(true);
    expect(result?.usedAdvancedFallback).toBe(true);
    expect(result?.avoidedAdvancedExerciseIds).toEqual([]);
  });

  test('beginner with an all-safe pool: gate is not even flagged as applied (nothing to avoid)', () => {
    const result = selectExerciseForSlot([beginnerEx, intermediateEx], 'beginner');
    expect(result?.exercise.id).toBe('beg-1');
    expect(result?.gateApplied).toBe(false);
    expect(result?.usedAdvancedFallback).toBe(false);
  });

  test('ranking order is respected: the first non-advanced candidate wins, not just any safe one', () => {
    const result = selectExerciseForSlot([advancedEx, intermediateEx, beginnerEx], 'beginner');
    expect(result?.exercise.id).toBe('int-1');
  });
});
