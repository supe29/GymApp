import { calculateBmr, calculateTdee, getActivityMultiplier } from './bmrCalculator';

describe('calculateBmr (FR-3.1, Mifflin-St Jeor)', () => {
  test('matches a known reference calculation for a male profile', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780
    const bmr = calculateBmr({ age: 30, heightCm: 180, weightKg: 80, biologicalSex: 'male' });
    expect(bmr).toBeCloseTo(1780, 5);
  });

  test('matches a known reference calculation for a female profile', () => {
    // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25
    const bmr = calculateBmr({ age: 25, heightCm: 165, weightKg: 60, biologicalSex: 'female' });
    expect(bmr).toBeCloseTo(1345.25, 5);
  });

  test('prefer_not_to_say falls exactly between the male and female results for identical inputs', () => {
    const input = { age: 28, heightCm: 170, weightKg: 70 };
    const male = calculateBmr({ ...input, biologicalSex: 'male' });
    const female = calculateBmr({ ...input, biologicalSex: 'female' });
    const unspecified = calculateBmr({ ...input, biologicalSex: 'prefer_not_to_say' });
    expect(unspecified).toBeCloseTo((male + female) / 2, 5);
  });
});

describe('getActivityMultiplier (FR-3.1)', () => {
  test.each([
    [1, 1.2],
    [2, 1.2],
    [3, 1.55],
    [4, 1.55],
    [5, 1.725],
    [6, 1.725],
    [7, 1.9],
  ])('trainingDaysPerWeek=%s -> multiplier %s', (days, expected) => {
    expect(getActivityMultiplier(days)).toBe(expected);
  });

  test('throws for an out-of-range value rather than silently defaulting', () => {
    expect(() => getActivityMultiplier(0)).toThrow();
    expect(() => getActivityMultiplier(8)).toThrow();
  });
});

describe('calculateTdee (FR-3.1)', () => {
  test('multiplies BMR by the correct activity multiplier', () => {
    expect(calculateTdee(1780, 3)).toBeCloseTo(1780 * 1.55, 5);
  });
});
