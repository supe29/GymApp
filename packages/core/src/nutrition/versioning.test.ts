import { diffNutritionTargets, toComparableNutritionTargets, type ComparableNutritionTargets } from './versioning';
import { generateNutritionTargets } from './nutritionGenerator';

const base: ComparableNutritionTargets = { dailyCalories: 2000, proteinG: 150, carbsG: 200, fatG: 55 };

describe('diffNutritionTargets (FR-2.4)', () => {
  test('no prior targets: changed is true, previous is null, deltas equal the new values', () => {
    const diff = diffNutritionTargets(null, base);
    expect(diff.changed).toBe(true);
    expect(diff.previous).toBeNull();
    expect(diff.deltas).toEqual(base);
  });

  test('identical targets: changed is false, deltas are all zero', () => {
    const diff = diffNutritionTargets(base, { ...base });
    expect(diff.changed).toBe(false);
    expect(diff.deltas).toEqual({ dailyCalories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  test('a calorie-only change is detected with the correct delta', () => {
    const next = { ...base, dailyCalories: 1800 };
    const diff = diffNutritionTargets(base, next);
    expect(diff.changed).toBe(true);
    expect(diff.deltas.dailyCalories).toBe(-200);
    expect(diff.deltas.proteinG).toBe(0);
  });

  test('a macro-only change (no calorie change) is still detected as changed', () => {
    const next = { ...base, proteinG: 160, carbsG: 190 };
    const diff = diffNutritionTargets(base, next);
    expect(diff.changed).toBe(true);
    expect(diff.deltas.proteinG).toBe(10);
    expect(diff.deltas.carbsG).toBe(-10);
    expect(diff.deltas.dailyCalories).toBe(0);
  });

  test('toComparableNutritionTargets strips a real GeneratedNutritionTargets down to the comparable shape', () => {
    const generated = generateNutritionTargets({
      age: 30,
      heightCm: 175,
      weightKg: 75,
      biologicalSex: 'male',
      goal: 'general_fitness',
      trainingDaysPerWeek: 3,
    });
    const comparable = toComparableNutritionTargets(generated);
    expect(comparable).toEqual({
      dailyCalories: generated.dailyCalories,
      proteinG: generated.proteinG,
      carbsG: generated.carbsG,
      fatG: generated.fatG,
    });
  });
});
