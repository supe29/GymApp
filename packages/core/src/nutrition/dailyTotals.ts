// Phase 9: shared, pure read layer over a day's food log entries (FR-7.3).
// Framework- and backend-agnostic by design, same as ../logs/logAggregation.ts
// — operates on an already-fetched, denormalized array; the actual Supabase
// query + client-side join against food_items is a packages/api-client
// concern (packages/api-client/src/foodLog.ts). Deliberately contains no
// querying/joining logic of its own — this module only sums and groups.

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface FoodLogEntryWithFoodItem {
  id: string;
  mealSlot: MealSlot;
  portionQuantity: number;
  caloriesPerPortion: number;
  proteinGPerPortion: number;
  carbsGPerPortion: number;
  fatGPerPortion: number;
}

export interface DailyNutritionTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const EMPTY_TOTALS: DailyNutritionTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** FR-7.3: sums calories/macros across a day's logged entries, scaled by each entry's portion quantity. */
export function computeDailyTotals(entries: FoodLogEntryWithFoodItem[]): DailyNutritionTotals {
  return entries.reduce<DailyNutritionTotals>(
    (totals, entry) => ({
      calories: totals.calories + entry.caloriesPerPortion * entry.portionQuantity,
      proteinG: totals.proteinG + entry.proteinGPerPortion * entry.portionQuantity,
      carbsG: totals.carbsG + entry.carbsGPerPortion * entry.portionQuantity,
      fatG: totals.fatG + entry.fatGPerPortion * entry.portionQuantity,
    }),
    { ...EMPTY_TOTALS },
  );
}

/**
 * FR-7.2: a day's logged entries grouped by meal slot, for a per-meal diary
 * view. Generic over `T` (rather than fixed to `FoodLogEntryWithFoodItem`)
 * so callers can pass a richer shape — e.g. api-client's
 * `FoodLogEntryForDiary`, which adds display fields like `foodName` — and
 * get that same richer type back out, mirroring
 * `../progression/applyProgressionOverlay.ts`'s generic pattern.
 */
export function groupByMealSlot<T extends FoodLogEntryWithFoodItem>(entries: T[]): Map<MealSlot, T[]> {
  const groups = new Map<MealSlot, T[]>();
  for (const entry of entries) {
    const list = groups.get(entry.mealSlot) ?? [];
    list.push(entry);
    groups.set(entry.mealSlot, list);
  }
  return groups;
}
