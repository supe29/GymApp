import type { BiologicalSex, Goal } from '../validation/profileValidation';
import { generateNutritionTargets, type NutritionGeneratorInput } from './nutritionGenerator';

const GOALS: Goal[] = ['fat_loss', 'muscle_gain', 'strength', 'general_fitness'];
const SEXES: BiologicalSex[] = ['male', 'female', 'prefer_not_to_say'];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

function baseInput(overrides: Partial<NutritionGeneratorInput> = {}): NutritionGeneratorInput {
  return {
    age: 30,
    heightCm: 175,
    weightKg: 75,
    biologicalSex: 'male',
    goal: 'general_fitness',
    trainingDaysPerWeek: 3,
    ...overrides,
  };
}

describe('generateNutritionTargets (FR-3.1/FR-3.2/FR-3.3/SR-1/SR-2/NFR-7)', () => {
  test('produces a valid, non-empty target set for every goal x sex x training-day combination', () => {
    for (const goal of GOALS) {
      for (const biologicalSex of SEXES) {
        for (const trainingDaysPerWeek of DAYS) {
          const result = generateNutritionTargets(baseInput({ goal, biologicalSex, trainingDaysPerWeek }));
          expect(result.dailyCalories).toBeGreaterThan(0);
          expect(result.proteinG).toBeGreaterThanOrEqual(0);
          expect(result.carbsG).toBeGreaterThanOrEqual(0);
          expect(result.fatG).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  test('SR-1 adversarial: the calorie floor is never breached under extreme low-weight/aggressive-deficit inputs, for every biological sex', () => {
    for (const biologicalSex of SEXES) {
      const result = generateNutritionTargets(
        baseInput({ biologicalSex, weightKg: 35, heightCm: 140, age: 80, goal: 'fat_loss', trainingDaysPerWeek: 7 }),
      );
      const expectedFloor = biologicalSex === 'female' ? 1200 : 1500;
      expect(result.dailyCalories).toBeGreaterThanOrEqual(expectedFloor);
    }
  });

  test('FR-3.3: only numeric targets are produced — no meal/recipe content exists on the result shape', () => {
    const result = generateNutritionTargets(baseInput());
    expect(Object.keys(result).sort()).toEqual(
      ['dailyCalories', 'proteinG', 'carbsG', 'fatG', 'unsafeConfigurationWarning', 'provenance'].sort(),
    );
  });

  test('SR-2: surfaces a warning for an aggressive fat_loss + high training volume configuration', () => {
    const result = generateNutritionTargets(
      baseInput({ goal: 'fat_loss', trainingDaysPerWeek: 7, weightKg: 60, heightCm: 160, age: 25, biologicalSex: 'female' }),
    );
    expect(result.unsafeConfigurationWarning).not.toBeNull();
  });

  test('SR-2: no warning for an ordinary configuration', () => {
    const result = generateNutritionTargets(baseInput({ goal: 'general_fitness', trainingDaysPerWeek: 3 }));
    expect(result.unsafeConfigurationWarning).toBeNull();
  });

  test('NFR-7: every result carries full provenance tracing back to the formula inputs', () => {
    const result = generateNutritionTargets(baseInput({ trainingDaysPerWeek: 4, goal: 'muscle_gain' }));
    expect(result.provenance.bmr).toBeGreaterThan(0);
    expect(result.provenance.tdee).toBeGreaterThan(0);
    expect(result.provenance.activityMultiplier).toBe(1.55);
    expect(result.provenance.goalAdjustmentFraction).toBe(0.15);
    expect(result.provenance.calorieFloor).toBeGreaterThan(0);
    expect(typeof result.provenance.floorApplied).toBe('boolean');
  });

  test('provenance.floorApplied is true exactly when the pre-clamp value was below the floor', () => {
    const clamped = generateNutritionTargets(
      baseInput({ weightKg: 35, heightCm: 140, age: 80, goal: 'fat_loss', biologicalSex: 'female', trainingDaysPerWeek: 1 }),
    );
    expect(clamped.provenance.floorApplied).toBe(true);
    expect(clamped.dailyCalories).toBe(clamped.provenance.calorieFloor);

    const unclamped = generateNutritionTargets(baseInput({ goal: 'general_fitness' }));
    expect(unclamped.provenance.floorApplied).toBe(false);
    expect(unclamped.dailyCalories).toBe(unclamped.provenance.preClampCalories);
  });

  test('is deterministic: identical input always produces an identical result', () => {
    const input = baseInput({ goal: 'strength', trainingDaysPerWeek: 5 });
    expect(generateNutritionTargets(input)).toEqual(generateNutritionTargets(input));
  });
});
