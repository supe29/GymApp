import { computeDailyTotals, groupByMealSlot, type FoodLogEntryWithFoodItem } from './dailyTotals';

function entry(overrides: Partial<FoodLogEntryWithFoodItem> = {}): FoodLogEntryWithFoodItem {
  return {
    id: 'entry-1',
    mealSlot: 'breakfast',
    portionQuantity: 1,
    caloriesPerPortion: 100,
    proteinGPerPortion: 10,
    carbsGPerPortion: 20,
    fatGPerPortion: 5,
    ...overrides,
  };
}

describe('FR-7.3: computeDailyTotals', () => {
  it('returns zeros for an empty day', () => {
    expect(computeDailyTotals([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it('sums a single entry scaled by its portion quantity', () => {
    const totals = computeDailyTotals([entry({ portionQuantity: 2 })]);
    expect(totals).toEqual({ calories: 200, proteinG: 20, carbsG: 40, fatG: 10 });
  });

  it('sums across mixed foods and meal slots', () => {
    const totals = computeDailyTotals([
      entry({ id: 'a', mealSlot: 'breakfast', portionQuantity: 1, caloriesPerPortion: 100, proteinGPerPortion: 10, carbsGPerPortion: 20, fatGPerPortion: 5 }),
      entry({ id: 'b', mealSlot: 'dinner', portionQuantity: 1.5, caloriesPerPortion: 200, proteinGPerPortion: 30, carbsGPerPortion: 10, fatGPerPortion: 8 }),
    ]);
    expect(totals).toEqual({
      calories: 100 + 300,
      proteinG: 10 + 45,
      carbsG: 20 + 15,
      fatG: 5 + 12,
    });
  });
});

describe('FR-7.2: groupByMealSlot', () => {
  it('returns an empty map for an empty day', () => {
    expect(groupByMealSlot([]).size).toBe(0);
  });

  it('buckets entries into their respective meal slots', () => {
    const groups = groupByMealSlot([
      entry({ id: 'a', mealSlot: 'breakfast' }),
      entry({ id: 'b', mealSlot: 'snack' }),
      entry({ id: 'c', mealSlot: 'breakfast' }),
    ]);
    expect(groups.get('breakfast')?.map((e) => e.id)).toEqual(['a', 'c']);
    expect(groups.get('snack')?.map((e) => e.id)).toEqual(['b']);
    expect(groups.get('lunch')).toBeUndefined();
  });
});
