import type { FitnessLevel, Goal } from '../validation/profileValidation';
import { SPLIT_RULES } from './rules/splitRules';
import { selectSplit } from './splitSelector';

const GOALS: Goal[] = ['fat_loss', 'muscle_gain', 'strength', 'general_fitness'];
const LEVELS: FitnessLevel[] = ['beginner', 'intermediate', 'advanced'];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

describe('selectSplit (FR-2.1)', () => {
  const allCombos: Array<[Goal, FitnessLevel, number]> = [];
  for (const goal of GOALS) {
    for (const fitnessLevel of LEVELS) {
      for (const trainingDaysPerWeek of DAYS) {
        allCombos.push([goal, fitnessLevel, trainingDaysPerWeek]);
      }
    }
  }

  test.each(allCombos)(
    'produces a valid, non-empty plan for goal=%s level=%s days=%s',
    (goal, fitnessLevel, trainingDaysPerWeek) => {
      const result = selectSplit({ goal, fitnessLevel, trainingDaysPerWeek });
      expect(['full_body', 'upper_lower', 'push_pull_legs']).toContain(result.splitType);
      expect(result.sessionTemplates).toHaveLength(trainingDaysPerWeek);
      expect(SPLIT_RULES.some((r) => r.id === result.splitRuleId)).toBe(true);
      result.sessionTemplates.forEach((session, i) => {
        expect(session.dayOrder).toBe(i + 1);
        expect(session.muscleGroupKeys.length).toBeGreaterThan(0);
      });
    },
  );

  test('every rule in SPLIT_RULES is reachable by at least one combo', () => {
    const reachedIds = new Set(allCombos.map(([goal, fitnessLevel, trainingDaysPerWeek]) =>
      selectSplit({ goal, fitnessLevel, trainingDaysPerWeek }).splitRuleId,
    ));
    for (const rule of SPLIT_RULES) {
      expect(reachedIds.has(rule.id)).toBe(true);
    }
  });

  test('a strength goal at intermediate level with 3 days stays full_body, not upper_lower', () => {
    const result = selectSplit({
      goal: 'strength',
      fitnessLevel: 'intermediate',
      trainingDaysPerWeek: 3,
    });
    expect(result.splitType).toBe('full_body');
    expect(result.splitRuleId).toBe('split-03');
  });

  test('a non-strength goal at intermediate level with 3 days is upper_lower, not full_body', () => {
    const result = selectSplit({
      goal: 'general_fitness',
      fitnessLevel: 'intermediate',
      trainingDaysPerWeek: 3,
    });
    expect(result.splitType).toBe('upper_lower');
    expect(result.splitRuleId).toBe('split-05');
  });

  test('a beginner at 5 days gets upper_lower, not push_pull_legs', () => {
    const result = selectSplit({
      goal: 'general_fitness',
      fitnessLevel: 'beginner',
      trainingDaysPerWeek: 5,
    });
    expect(result.splitType).toBe('upper_lower');
    expect(result.splitRuleId).toBe('split-07');
  });

  test('an intermediate at 6 days gets push_pull_legs', () => {
    const result = selectSplit({
      goal: 'general_fitness',
      fitnessLevel: 'intermediate',
      trainingDaysPerWeek: 6,
    });
    expect(result.splitType).toBe('push_pull_legs');
    expect(result.splitRuleId).toBe('split-08');
  });

  test('repeated day templates get lettered suffixes in order', () => {
    const result = selectSplit({
      goal: 'general_fitness',
      fitnessLevel: 'intermediate',
      trainingDaysPerWeek: 6,
    });
    expect(result.sessionTemplates.map((s) => s.name)).toEqual([
      'Push A',
      'Pull A',
      'Legs A',
      'Push B',
      'Pull B',
      'Legs B',
    ]);
  });

  test('a 3-day upper/lower week letters its second pass through the templates', () => {
    const result = selectSplit({
      goal: 'general_fitness',
      fitnessLevel: 'intermediate',
      trainingDaysPerWeek: 3,
    });
    expect(result.sessionTemplates.map((s) => s.name)).toEqual(['Upper A', 'Lower A', 'Upper B']);
  });

  test('no lettered suffix when the split has exactly enough days for one pass', () => {
    const result = selectSplit({
      goal: 'general_fitness',
      fitnessLevel: 'beginner',
      trainingDaysPerWeek: 1,
    });
    expect(result.sessionTemplates.map((s) => s.name)).toEqual(['Full Body']);
  });

  test('is deterministic: identical input always produces an identical result', () => {
    const input = { goal: 'muscle_gain' as Goal, fitnessLevel: 'advanced' as FitnessLevel, trainingDaysPerWeek: 4 };
    expect(selectSplit(input)).toEqual(selectSplit(input));
  });
});
