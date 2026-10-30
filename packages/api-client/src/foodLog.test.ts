import { deleteFoodLogEntry, getFoodLogEntriesForDate, logFoodEntry } from './foodLog';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

const TARGET_ROW = {
  id: 'target-1',
  user_id: 'user-1',
  daily_calories: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 60,
  target_version: 1,
  effective_from: '2026-01-01T00:00:00Z',
  superseded_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('logFoodEntry (FR-7.1/FR-7.2/DR-5)', () => {
  test('resolves the current nutrition target and attaches its id to the insert', async () => {
    const { client, from } = createMockClient();
    const insertBuilder = createQueryBuilderMock({
      data: {
        id: 'entry-1',
        user_id: 'user-1',
        food_item_id: 'food-1',
        nutrition_target_id: 'target-1',
        meal_slot: 'breakfast',
        portion_quantity: 1,
        log_date: '2026-10-28',
        logged_at: '2026-10-28T08:00:00Z',
        created_at: '2026-10-28T08:00:00Z',
      },
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === 'nutrition_targets') return createQueryBuilderMock({ data: TARGET_ROW, error: null });
      if (table === 'food_log_entries') return insertBuilder;
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await logFoodEntry(client, 'user-1', {
      foodItemId: 'food-1',
      mealSlot: 'breakfast',
      portionQuantity: 1,
      logDate: '2026-10-28',
    });

    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ nutrition_target_id: 'target-1', food_item_id: 'food-1' }),
    );
    expect(result.error).toBeNull();
    expect(result.data?.nutritionTargetId).toBe('target-1');
  });

  test('errors without inserting when the user has no active nutrition targets', async () => {
    const { client, from } = createMockClient();
    from.mockImplementation((table: string) => {
      if (table === 'nutrition_targets') return createQueryBuilderMock({ data: null, error: null });
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await logFoodEntry(client, 'user-1', {
      foodItemId: 'food-1',
      mealSlot: 'breakfast',
      portionQuantity: 1,
      logDate: '2026-10-28',
    });

    expect(result.data).toBeNull();
    expect(result.error).toMatch(/no active nutrition targets/i);
  });
});

describe('getFoodLogEntriesForDate (FR-7.3)', () => {
  test('joins entries with their food items via a client-side Map', async () => {
    const { client, from } = createMockClient();
    from.mockImplementation((table: string) => {
      if (table === 'food_log_entries') {
        return createQueryBuilderMock({
          data: [
            {
              id: 'entry-1',
              user_id: 'user-1',
              food_item_id: 'food-1',
              nutrition_target_id: 'target-1',
              meal_slot: 'breakfast',
              portion_quantity: 2,
              log_date: '2026-10-28',
              logged_at: '2026-10-28T08:00:00Z',
              created_at: '2026-10-28T08:00:00Z',
            },
          ],
          error: null,
        });
      }
      if (table === 'food_items') {
        return createQueryBuilderMock({
          data: [
            {
              id: 'food-1',
              name: 'Banana',
              brand: null,
              barcode: null,
              portion_description: '1 medium',
              calories_per_portion: 105,
              protein_g_per_portion: 1.3,
              carbs_g_per_portion: 27,
              fat_g_per_portion: 0.4,
              source: 'external',
              created_by_user_id: null,
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await getFoodLogEntriesForDate(client, 'user-1', '2026-10-28');

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        id: 'entry-1',
        mealSlot: 'breakfast',
        portionQuantity: 2,
        caloriesPerPortion: 105,
        proteinGPerPortion: 1.3,
        carbsGPerPortion: 27,
        fatGPerPortion: 0.4,
        foodItemId: 'food-1',
        foodName: 'Banana',
        portionDescription: '1 medium',
        logDate: '2026-10-28',
        loggedAt: '2026-10-28T08:00:00Z',
      },
    ]);
  });

  test('skips the food_items query entirely for an empty day', async () => {
    const { client, from } = createMockClient();
    from.mockImplementation((table: string) => {
      if (table === 'food_log_entries') return createQueryBuilderMock({ data: [], error: null });
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await getFoodLogEntriesForDate(client, 'user-1', '2026-10-28');

    expect(result.data).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe('deleteFoodLogEntry (FR-7.1)', () => {
  test('filters by id and user_id', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: null, error: null });
    from.mockReturnValue(builder);

    const result = await deleteFoodLogEntry(client, 'user-1', 'entry-1');

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'entry-1');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result.error).toBeNull();
  });
});
