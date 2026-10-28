import type { GeneratedNutritionTargets } from 'core';

import {
  buildNutritionRegenerationPreview,
  createNutritionTargets,
  generateInitialNutritionTargets,
  getCurrentNutritionTargets,
  type NutritionTargetsRow,
} from './nutrition';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

const fakeTargetsRow: NutritionTargetsRow = {
  id: 'targets-1',
  user_id: 'user-1',
  daily_calories: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 55,
  target_version: 1,
  effective_from: '2026-01-01T00:00:00Z',
  superseded_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

function fakeGeneratedTargets(): GeneratedNutritionTargets {
  return {
    dailyCalories: 2000,
    proteinG: 150,
    carbsG: 200,
    fatG: 55,
    unsafeConfigurationWarning: null,
    provenance: {
      bmr: 1700,
      tdee: 2000,
      activityMultiplier: 1.55,
      goalAdjustmentFraction: 0,
      preClampCalories: 2000,
      calorieFloor: 1500,
      floorApplied: false,
    },
  };
}

const fakeProfile = {
  user_id: 'user-1',
  age: 30,
  height_cm: 175,
  weight_kg: 75,
  biological_sex: 'male' as const,
  fitness_level: 'beginner' as const,
  goal: 'general_fitness' as const,
  training_days_per_week: 3,
  unit_preference: 'metric' as const,
  created_at: '',
  updated_at: '',
};

describe('createNutritionTargets (FR-3.1/DR-5)', () => {
  test('inserts a single nutrition_targets row with no target_version in the payload', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: fakeTargetsRow, error: null });
    from.mockReturnValueOnce(builder);

    const result = await createNutritionTargets(client, 'user-1', fakeGeneratedTargets());

    expect(from).toHaveBeenCalledWith('nutrition_targets');
    expect(builder.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      daily_calories: 2000,
      protein_g: 150,
      carbs_g: 200,
      fat_g: 55,
    });
    const insertedPayload = (builder.insert as jest.Mock).mock.calls[0][0];
    expect(insertedPayload).not.toHaveProperty('target_version');
    expect(result.error).toBeNull();
    expect(result.data?.targetVersion).toBe(1);
  });

  test('surfaces an insert error', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(createQueryBuilderMock({ data: null, error: { message: 'insert failed' } }));

    const result = await createNutritionTargets(client, 'user-1', fakeGeneratedTargets());

    expect(result.error).toBe('insert failed');
  });

  test('DR-5 regression: never calls update or delete against nutrition_targets', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: fakeTargetsRow, error: null });
    from.mockReturnValueOnce(builder);

    await createNutritionTargets(client, 'user-1', fakeGeneratedTargets());

    expect(builder.update).not.toHaveBeenCalled();
    expect(builder.delete).not.toHaveBeenCalled();
  });
});

describe('getCurrentNutritionTargets (FR-2.4)', () => {
  test('filters to the non-superseded row, ordered by target_version desc, limited to 1', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: fakeTargetsRow, error: null });
    from.mockReturnValueOnce(builder);

    await getCurrentNutritionTargets(client, 'user-1');

    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.is).toHaveBeenCalledWith('superseded_at', null);
    expect(builder.order).toHaveBeenCalledWith('target_version', { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(1);
  });

  test('returns null data (not an error) when the user has no targets yet', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(createQueryBuilderMock({ data: null, error: null }));

    const result = await getCurrentNutritionTargets(client, 'user-1');

    expect(result).toEqual({ data: null, error: null });
  });

  test('maps a found row to the persisted shape', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(createQueryBuilderMock({ data: fakeTargetsRow, error: null }));

    const result = await getCurrentNutritionTargets(client, 'user-1');

    expect(result.data).toEqual({
      id: 'targets-1',
      dailyCalories: 2000,
      proteinG: 150,
      carbsG: 200,
      fatG: 55,
      targetVersion: 1,
      effectiveFrom: '2026-01-01T00:00:00Z',
    });
  });
});

describe('generateInitialNutritionTargets (AC-1)', () => {
  test('generates and persists real targets from the fetched profile', async () => {
    const { client, from } = createMockClient();
    from
      .mockReturnValueOnce(createQueryBuilderMock({ data: fakeProfile, error: null }))
      .mockReturnValueOnce(createQueryBuilderMock({ data: fakeTargetsRow, error: null }));

    const result = await generateInitialNutritionTargets(client, 'user-1');

    expect(result.error).toBeNull();
    expect(result.data?.dailyCalories).toBeGreaterThan(0);
  });

  test('surfaces an error when no profile exists yet', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(createQueryBuilderMock({ data: null, error: null }));

    const result = await generateInitialNutritionTargets(client, 'user-1');

    expect(result.data).toBeNull();
    expect(result.error).toContain('No profile found');
  });
});

describe('buildNutritionRegenerationPreview (FR-2.4)', () => {
  test('never calls insert, update, or delete on any table', async () => {
    const { client, from } = createMockClient();
    const queryBuilders: ReturnType<typeof createQueryBuilderMock>[] = [];
    from.mockImplementation((table: string) => {
      const data = table === 'profiles' ? fakeProfile : null;
      const builder = createQueryBuilderMock({ data, error: null });
      queryBuilders.push(builder);
      return builder;
    });

    const result = await buildNutritionRegenerationPreview(client, 'user-1');

    expect(result.error).toBeNull();
    expect(result.data?.currentTargets).toBeNull();
    for (const builder of queryBuilders) {
      expect(builder.insert).not.toHaveBeenCalled();
      expect(builder.update).not.toHaveBeenCalled();
      expect(builder.delete).not.toHaveBeenCalled();
    }
  });

  test('diffs the candidate against the current targets when one exists', async () => {
    const { client, from } = createMockClient();
    from.mockImplementation((table: string) => {
      if (table === 'profiles') return createQueryBuilderMock({ data: fakeProfile, error: null });
      if (table === 'nutrition_targets') return createQueryBuilderMock({ data: fakeTargetsRow, error: null });
      return createQueryBuilderMock({ data: null, error: null });
    });

    const result = await buildNutritionRegenerationPreview(client, 'user-1');

    expect(result.error).toBeNull();
    expect(result.data?.currentTargets?.dailyCalories).toBe(2000);
    expect(result.data?.diffSummary.previous).not.toBeNull();
  });
});
