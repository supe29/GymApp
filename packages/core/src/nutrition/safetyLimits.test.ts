import type { BiologicalSex } from '../validation/profileValidation';
import { checkUnsafeConfiguration, getCalorieFloor, SEX_CALORIE_FLOORS } from './safetyLimits';

describe('getCalorieFloor (SR-1/OQ-1)', () => {
  test('female floor is 1200 kcal', () => {
    expect(getCalorieFloor('female')).toBe(1200);
  });

  test('male floor is 1500 kcal', () => {
    expect(getCalorieFloor('male')).toBe(1500);
  });

  test('prefer_not_to_say uses the higher (safer) floor, not an average', () => {
    expect(getCalorieFloor('prefer_not_to_say')).toBe(1500);
    expect(SEX_CALORIE_FLOORS.prefer_not_to_say).toBe(Math.max(SEX_CALORIE_FLOORS.male, SEX_CALORIE_FLOORS.female));
  });

  test('every biological sex has a defined floor', () => {
    const sexes: BiologicalSex[] = ['male', 'female', 'prefer_not_to_say'];
    for (const sex of sexes) {
      expect(getCalorieFloor(sex)).toBeGreaterThan(0);
    }
  });
});

describe('checkUnsafeConfiguration (SR-2/OQ-8)', () => {
  test('returns null for an ordinary configuration', () => {
    const result = checkUnsafeConfiguration({
      goal: 'general_fitness',
      trainingDaysPerWeek: 3,
      preClampCalories: 2200,
      floor: 1500,
    });
    expect(result).toBeNull();
  });

  test('triggers on aggressive fat_loss + high training volume, even without breaching the floor', () => {
    const result = checkUnsafeConfiguration({
      goal: 'fat_loss',
      trainingDaysPerWeek: 6,
      preClampCalories: 1900,
      floor: 1500,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('aggressive fat-loss goal');
  });

  test('does not trigger the high-volume condition on fat_loss alone at moderate training days', () => {
    const result = checkUnsafeConfiguration({
      goal: 'fat_loss',
      trainingDaysPerWeek: 3,
      preClampCalories: 1900,
      floor: 1500,
    });
    expect(result).toBeNull();
  });

  test('does not trigger the high-volume condition on high training days with a non-fat_loss goal', () => {
    const result = checkUnsafeConfiguration({
      goal: 'muscle_gain',
      trainingDaysPerWeek: 7,
      preClampCalories: 2800,
      floor: 1500,
    });
    expect(result).toBeNull();
  });

  test('triggers when the pre-clamp calculation falls meaningfully below the floor', () => {
    const result = checkUnsafeConfiguration({
      goal: 'general_fitness',
      trainingDaysPerWeek: 3,
      preClampCalories: 1100,
      floor: 1500,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('safe minimum');
  });

  test('does not trigger when the pre-clamp calculation is only marginally below the floor', () => {
    const result = checkUnsafeConfiguration({
      goal: 'general_fitness',
      trainingDaysPerWeek: 3,
      preClampCalories: 1450,
      floor: 1500,
    });
    expect(result).toBeNull();
  });

  test('triggers a combined message when both conditions hold at once', () => {
    const result = checkUnsafeConfiguration({
      goal: 'fat_loss',
      trainingDaysPerWeek: 7,
      preClampCalories: 1000,
      floor: 1500,
    });
    expect(result).not.toBeNull();
    expect(result).toContain('aggressive fat-loss goal');
    expect(result).toContain('well below the safe minimum');
  });
});
