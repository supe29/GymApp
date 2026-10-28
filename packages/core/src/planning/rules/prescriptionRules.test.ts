import type { FitnessLevel, Goal } from '../../validation/profileValidation';
import { getPrescription, PRESCRIPTION_RULES } from './prescriptionRules';

const GOALS: Goal[] = ['fat_loss', 'muscle_gain', 'strength', 'general_fitness'];
const LEVELS: FitnessLevel[] = ['beginner', 'intermediate', 'advanced'];

describe('getPrescription (FR-2.3)', () => {
  test('PRESCRIPTION_RULES is exhaustive (4 goals x 3 levels)', () => {
    expect(PRESCRIPTION_RULES).toHaveLength(12);
  });

  test.each(GOALS.flatMap((goal) => LEVELS.map((fitnessLevel) => [goal, fitnessLevel] as const)))(
    'returns DB-constraint-consistent values for goal=%s fitnessLevel=%s',
    (goal, fitnessLevel) => {
      const rule = getPrescription(goal, fitnessLevel);
      expect(rule.targetSets).toBeGreaterThan(0);
      expect(rule.targetRepsMin).toBeGreaterThan(0);
      expect(rule.targetRepsMax).toBeGreaterThanOrEqual(rule.targetRepsMin);
      expect(rule.intensityNoteTemplate).toContain('{equipmentKind}');
    },
  );

  test('strength prescribes lower reps than fat_loss at the same level', () => {
    for (const fitnessLevel of LEVELS) {
      expect(getPrescription('strength', fitnessLevel).targetRepsMax).toBeLessThan(
        getPrescription('fat_loss', fitnessLevel).targetRepsMax,
      );
    }
  });

  test('throws for an unknown combination rather than silently defaulting', () => {
    expect(() => getPrescription('nonexistent' as Goal, 'beginner')).toThrow();
  });
});
