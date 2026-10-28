import {
  didPlanAffectingFieldChange,
  fieldsAffectingGeneratedPlan,
  ProfileInput,
  validateProfileInput,
} from './profileValidation';

const validInput: ProfileInput = {
  age: 30,
  heightCm: 175,
  weightKg: 75,
  biologicalSex: 'prefer_not_to_say',
  fitnessLevel: 'beginner',
  goal: 'general_fitness',
  trainingDaysPerWeek: 3,
  equipmentItemIds: ['equip-1', 'equip-2'],
};

describe('validateProfileInput', () => {
  test('accepts a fully valid profile', () => {
    expect(validateProfileInput(validInput)).toEqual({ valid: true, errors: [] });
  });

  test.each([
    [12, false],
    [13, true],
    [120, true],
    [121, false],
    [30.5, false],
  ])('age boundary: %p -> valid=%p', (age, expectedValid) => {
    const result = validateProfileInput({ ...validInput, age });
    expect(result.valid).toBe(expectedValid);
    if (!expectedValid) {
      expect(result.errors.some((e) => e.field === 'age')).toBe(true);
    }
  });

  test.each([
    [49, false],
    [50, true],
    [272, true],
    [273, false],
  ])('heightCm boundary: %p -> valid=%p', (heightCm, expectedValid) => {
    expect(validateProfileInput({ ...validInput, heightCm }).valid).toBe(expectedValid);
  });

  test.each([
    [19, false],
    [20, true],
    [400, true],
    [401, false],
  ])('weightKg boundary: %p -> valid=%p', (weightKg, expectedValid) => {
    expect(validateProfileInput({ ...validInput, weightKg }).valid).toBe(expectedValid);
  });

  // OQ-6 (see /docs/decisions/OQ-6-biological-sex.md): exactly these three
  // values, nothing else.
  test.each(['male', 'female', 'prefer_not_to_say'])(
    'biologicalSex accepts %p',
    (biologicalSex) => {
      expect(
        validateProfileInput({ ...validInput, biologicalSex: biologicalSex as never }).valid,
      ).toBe(true);
    },
  );

  test('biologicalSex rejects any value outside the OQ-6 resolved set', () => {
    const result = validateProfileInput({
      ...validInput,
      biologicalSex: 'non_binary' as never,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'biologicalSex')).toBe(true);
  });

  test.each([
    [0, false],
    [1, true],
    [7, true],
    [8, false],
    [3.5, false],
  ])('trainingDaysPerWeek boundary: %p -> valid=%p', (trainingDaysPerWeek, expectedValid) => {
    expect(validateProfileInput({ ...validInput, trainingDaysPerWeek }).valid).toBe(
      expectedValid,
    );
  });

  test('rejects an invalid fitnessLevel', () => {
    const result = validateProfileInput({ ...validInput, fitnessLevel: 'expert' as never });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'fitnessLevel')).toBe(true);
  });

  test('rejects an invalid goal', () => {
    const result = validateProfileInput({ ...validInput, goal: 'bulk' as never });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'goal')).toBe(true);
  });

  test('accepts an empty equipment list (bodyweight-only is valid)', () => {
    expect(validateProfileInput({ ...validInput, equipmentItemIds: [] }).valid).toBe(true);
  });

  test('rejects a non-array equipment value', () => {
    const result = validateProfileInput({
      ...validInput,
      equipmentItemIds: 'barbell' as unknown as string[],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'equipmentItemIds')).toBe(true);
  });

  test('reports every invalid field at once, not just the first', () => {
    const result = validateProfileInput({
      ...validInput,
      age: 5,
      goal: 'bulk' as never,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.field).sort()).toEqual(['age', 'goal']);
  });
});

describe('didPlanAffectingFieldChange (FR-1.4)', () => {
  test('returns false when nothing changes', () => {
    expect(didPlanAffectingFieldChange(validInput, { ...validInput })).toBe(false);
  });

  test('returns false when only a non-plan-affecting field changes (age)', () => {
    expect(didPlanAffectingFieldChange(validInput, { ...validInput, age: 31 })).toBe(false);
  });

  test('returns false when only a non-plan-affecting field changes (biologicalSex)', () => {
    expect(
      didPlanAffectingFieldChange(validInput, { ...validInput, biologicalSex: 'male' }),
    ).toBe(false);
  });

  test.each(fieldsAffectingGeneratedPlan())('returns true when %s changes', (field) => {
    const next: ProfileInput = { ...validInput };
    switch (field) {
      case 'weightKg':
        next.weightKg = validInput.weightKg + 5;
        break;
      case 'goal':
        next.goal = 'fat_loss';
        break;
      case 'trainingDaysPerWeek':
        next.trainingDaysPerWeek = validInput.trainingDaysPerWeek + 1;
        break;
      case 'fitnessLevel':
        next.fitnessLevel = 'advanced';
        break;
      case 'equipmentItemIds':
        next.equipmentItemIds = [...validInput.equipmentItemIds, 'equip-3'];
        break;
      default:
        throw new Error(`unexpected plan-affecting field in test: ${field}`);
    }
    expect(didPlanAffectingFieldChange(validInput, next)).toBe(true);
  });

  test('equipment change detection ignores ordering', () => {
    const next: ProfileInput = {
      ...validInput,
      equipmentItemIds: [...validInput.equipmentItemIds].reverse(),
    };
    expect(didPlanAffectingFieldChange(validInput, next)).toBe(false);
  });
});
