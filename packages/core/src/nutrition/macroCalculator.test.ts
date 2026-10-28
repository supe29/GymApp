import { calculateCalorieTarget, calculateMacros, GOAL_CALORIE_ADJUSTMENTS } from './macroCalculator';

describe('calculateCalorieTarget (FR-3.1/SR-1)', () => {
  test('fat_loss applies a -20% adjustment', () => {
    const result = calculateCalorieTarget(2000, 'fat_loss', 1200);
    expect(result.preClampCalories).toBe(1600);
    expect(result.dailyCalories).toBe(1600);
  });

  test('muscle_gain applies a +15% adjustment', () => {
    const result = calculateCalorieTarget(2000, 'muscle_gain', 1200);
    expect(result.preClampCalories).toBe(2300);
    expect(result.dailyCalories).toBe(2300);
  });

  test('general_fitness applies no adjustment (maintenance)', () => {
    expect(GOAL_CALORIE_ADJUSTMENTS.general_fitness).toBe(0);
    const result = calculateCalorieTarget(2000, 'general_fitness', 1200);
    expect(result.dailyCalories).toBe(2000);
  });

  test('SR-1: the floor clamps an aggressive deficit that would otherwise fall below it', () => {
    const result = calculateCalorieTarget(1400, 'fat_loss', 1200);
    expect(result.preClampCalories).toBe(1120);
    expect(result.dailyCalories).toBe(1200);
  });

  test('SR-1 boundary/adversarial: the floor holds under an extreme low-TDEE input', () => {
    const result = calculateCalorieTarget(100, 'fat_loss', 1500);
    expect(result.dailyCalories).toBe(1500);
    expect(result.dailyCalories).toBeGreaterThanOrEqual(1500);
  });
});

describe('calculateMacros (FR-3.1)', () => {
  test('protein is scaled by bodyweight and goal', () => {
    const macros = calculateMacros(2000, 'muscle_gain', 80);
    expect(macros.proteinG).toBe(144); // 1.8 * 80
  });

  test('fat is 25% of calories', () => {
    const macros = calculateMacros(2000, 'general_fitness', 70);
    expect(macros.fatG).toBeCloseTo((2000 * 0.25) / 9, 1);
  });

  test('remaining calories after protein and fat go to carbs', () => {
    const macros = calculateMacros(2000, 'general_fitness', 70);
    const proteinKcal = macros.proteinG * 4;
    const fatKcal = macros.fatG * 9;
    const expectedCarbsG = (2000 - proteinKcal - fatKcal) / 4;
    // Loose tolerance: protein/fat are each independently rounded to 1
    // decimal before carbs are derived from the remainder, so a small
    // compounding rounding difference (well under 1g) is expected here.
    expect(Math.abs(macros.carbsG - expectedCarbsG)).toBeLessThan(0.2);
  });

  test('all gram values are non-negative even under an extreme low-calorie/high-bodyweight combination', () => {
    const macros = calculateMacros(1200, 'fat_loss', 150);
    expect(macros.proteinG).toBeGreaterThanOrEqual(0);
    expect(macros.carbsG).toBeGreaterThanOrEqual(0);
    expect(macros.fatG).toBeGreaterThanOrEqual(0);
  });

  test('values are rounded to 1 decimal place', () => {
    const macros = calculateMacros(2033, 'fat_loss', 67.3);
    for (const value of [macros.proteinG, macros.carbsG, macros.fatG]) {
      expect(Math.round(value * 10) / 10).toBe(value);
    }
  });
});
