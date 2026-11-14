import type { FitnessLevel } from '../../validation/profileValidation';
import { getExercisesPerSession, SESSION_COMPOSITION_RULES } from './sessionComposition';
import type { SplitType } from './splitRules';

const SPLITS: SplitType[] = ['full_body', 'upper_lower', 'push_pull_legs', 'custom'];
const LEVELS: FitnessLevel[] = ['beginner', 'intermediate', 'advanced'];

describe('getExercisesPerSession (FR-2.3)', () => {
  test('SESSION_COMPOSITION_RULES is exhaustive (4 splits incl. FR-2.7 custom x 3 levels)', () => {
    expect(SESSION_COMPOSITION_RULES).toHaveLength(12);
  });

  test.each(SPLITS.flatMap((splitType) => LEVELS.map((fitnessLevel) => [splitType, fitnessLevel] as const)))(
    'returns a positive integer for splitType=%s fitnessLevel=%s',
    (splitType, fitnessLevel) => {
      const n = getExercisesPerSession(splitType, fitnessLevel);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThan(0);
    },
  );

  test('push_pull_legs sessions get fewer exercises than full_body at the same level', () => {
    for (const fitnessLevel of LEVELS) {
      expect(getExercisesPerSession('push_pull_legs', fitnessLevel)).toBeLessThan(
        getExercisesPerSession('full_body', fitnessLevel),
      );
    }
  });

  test('throws for an unknown combination rather than silently defaulting', () => {
    expect(() => getExercisesPerSession('full_body' as SplitType, 'nonexistent' as FitnessLevel)).toThrow();
  });
});
