import { createCustomFoodItem, searchFoodItems } from './foodSearch';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

const FOOD_ROW = {
  id: 'food-1',
  name: 'Banana',
  brand: null,
  barcode: null,
  portion_description: '1 medium',
  calories_per_portion: 105,
  protein_g_per_portion: 1.3,
  carbs_g_per_portion: 27,
  fat_g_per_portion: 0.4,
  source: 'external' as const,
  created_by_user_id: null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('searchFoodItems (FR-7.1/UX-7)', () => {
  test('maps matching rows to PersistedFoodItem', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: [FOOD_ROW], error: null });
    from.mockImplementation((table: string) => {
      if (table === 'food_items') return builder;
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await searchFoodItems(client, 'ban');

    expect(result.error).toBeNull();
    expect(builder.ilike).toHaveBeenCalledWith('name', '%ban%');
    expect(result.data).toEqual([
      {
        id: 'food-1',
        name: 'Banana',
        brand: null,
        barcode: null,
        portionDescription: '1 medium',
        caloriesPerPortion: 105,
        proteinGPerPortion: 1.3,
        carbsGPerPortion: 27,
        fatGPerPortion: 0.4,
        source: 'external',
        createdByUserId: null,
      },
    ]);
  });

  test('propagates a query error', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValue(createQueryBuilderMock({ data: null, error: { message: 'boom' } }));

    const result = await searchFoodItems(client, 'x');

    expect(result.data).toBeNull();
    expect(result.error).toBe('boom');
  });
});

describe('createCustomFoodItem (FR-7.1/DR-2/A-7)', () => {
  test('inserts with source=user_created and created_by_user_id set to the caller', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({
      data: { ...FOOD_ROW, id: 'food-2', name: 'My Snack', source: 'user_created', created_by_user_id: 'user-1' },
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === 'food_items') return builder;
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await createCustomFoodItem(client, 'user-1', {
      name: 'My Snack',
      portionDescription: '1 bar',
      caloriesPerPortion: 200,
      proteinGPerPortion: 10,
      carbsGPerPortion: 20,
      fatGPerPortion: 8,
    });

    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'user_created', created_by_user_id: 'user-1', barcode: null }),
    );
    expect(result.error).toBeNull();
    expect(result.data?.source).toBe('user_created');
    expect(result.data?.createdByUserId).toBe('user-1');
  });
});
