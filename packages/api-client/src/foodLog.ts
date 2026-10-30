import type { FoodLogEntryWithFoodItem, MealSlot } from 'core';

import type { GymSupabaseClient } from './client';
import { getCurrentNutritionTargets } from './nutrition';
import type { ApiResult } from './profile';
import type { Database } from './types/database';

export type FoodLogEntryRow = Database['public']['Tables']['food_log_entries']['Row'];

export interface PersistedFoodLogEntry {
  id: string;
  foodItemId: string;
  mealSlot: MealSlot;
  portionQuantity: number;
  logDate: string;
  loggedAt: string;
  nutritionTargetId: string;
}

export interface LogFoodEntryInput {
  foodItemId: string;
  mealSlot: MealSlot;
  portionQuantity: number;
  logDate: string;
}

/** A logged entry joined with its food item's macros — a structural superset of core's `FoodLogEntryWithFoodItem`, usable directly with `computeDailyTotals`/`groupByMealSlot`, plus the extra fields the diary UI needs to render/delete each row. */
export interface FoodLogEntryForDiary extends FoodLogEntryWithFoodItem {
  foodItemId: string;
  foodName: string;
  portionDescription: string;
  logDate: string;
  loggedAt: string;
}

function toPersisted(row: FoodLogEntryRow): PersistedFoodLogEntry {
  return {
    id: row.id,
    foodItemId: row.food_item_id,
    mealSlot: row.meal_slot,
    portionQuantity: row.portion_quantity,
    logDate: row.log_date,
    loggedAt: row.logged_at,
    nutritionTargetId: row.nutrition_target_id,
  };
}

/**
 * FR-7.1/FR-7.2/DR-5: logs a food entry, pinning it to the user's CURRENT
 * nutrition target (`nutrition_target_id` is a not-null FK with no DB-side
 * auto-derivation trigger for this column, unlike `workout_sessions`'s
 * `workout_plan_id`) so historical entries stay attributable to the target
 * version active when they were logged, even after later regenerations.
 */
export async function logFoodEntry(
  client: GymSupabaseClient,
  userId: string,
  input: LogFoodEntryInput,
): Promise<ApiResult<PersistedFoodLogEntry>> {
  const targetsRes = await getCurrentNutritionTargets(client, userId);
  if (targetsRes.error) {
    return { data: null, error: targetsRes.error };
  }
  if (!targetsRes.data) {
    return { data: null, error: 'No active nutrition targets found; generate targets first.' };
  }

  const { data, error } = await client
    .from('food_log_entries')
    .insert({
      user_id: userId,
      food_item_id: input.foodItemId,
      nutrition_target_id: targetsRes.data.id,
      meal_slot: input.mealSlot,
      portion_quantity: input.portionQuantity,
      log_date: input.logDate,
    })
    .select()
    .single();
  if (error || !data) {
    return { data: null, error: error ? error.message : 'Failed to log food entry.' };
  }
  return { data: toPersisted(data), error: null };
}

/**
 * FR-7.3: a day's logged entries joined with their food items' macros —
 * flat queries + a client-side `Map` join, matching
 * `exercises.ts`'s `getExercisesWithTags` convention (the hand-authored
 * `Database` type declares `Relationships: never[]` for every table, so no
 * embedded-select join is available). Returns `[]` with no second query
 * when the day has no entries.
 */
export async function getFoodLogEntriesForDate(
  client: GymSupabaseClient,
  userId: string,
  logDate: string,
): Promise<ApiResult<FoodLogEntryForDiary[]>> {
  const entriesRes = await client
    .from('food_log_entries')
    .select('*')
    .eq('user_id', userId)
    .eq('log_date', logDate);
  if (entriesRes.error) {
    return { data: null, error: entriesRes.error.message };
  }
  const entries = entriesRes.data ?? [];
  if (entries.length === 0) {
    return { data: [], error: null };
  }

  const foodItemIds = [...new Set(entries.map((e) => e.food_item_id))];
  const foodItemsRes = await client.from('food_items').select('*').in('id', foodItemIds);
  if (foodItemsRes.error) {
    return { data: null, error: foodItemsRes.error.message };
  }
  const foodItemById = new Map((foodItemsRes.data ?? []).map((f) => [f.id, f]));

  const joined: FoodLogEntryForDiary[] = [];
  for (const entry of entries) {
    const foodItem = foodItemById.get(entry.food_item_id);
    if (!foodItem) continue;
    joined.push({
      id: entry.id,
      mealSlot: entry.meal_slot,
      portionQuantity: entry.portion_quantity,
      caloriesPerPortion: foodItem.calories_per_portion,
      proteinGPerPortion: foodItem.protein_g_per_portion,
      carbsGPerPortion: foodItem.carbs_g_per_portion,
      fatGPerPortion: foodItem.fat_g_per_portion,
      foodItemId: foodItem.id,
      foodName: foodItem.name,
      portionDescription: foodItem.portion_description,
      logDate: entry.log_date,
      loggedAt: entry.logged_at,
    });
  }
  return { data: joined, error: null };
}

/** FR-7.1: removes a logged entry (e.g. to correct a mistake). `user_id` is filtered explicitly in addition to RLS, matching `workoutSessions.ts`'s owner-scoped mutation convention. */
export async function deleteFoodLogEntry(
  client: GymSupabaseClient,
  userId: string,
  entryId: string,
): Promise<ApiResult<null>> {
  const { error } = await client.from('food_log_entries').delete().eq('id', entryId).eq('user_id', userId);
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: null, error: null };
}
