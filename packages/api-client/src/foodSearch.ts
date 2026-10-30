import type { GymSupabaseClient } from './client';
import type { ApiResult } from './profile';
import type { Database } from './types/database';

export type FoodItemRow = Database['public']['Tables']['food_items']['Row'];

export interface PersistedFoodItem {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  portionDescription: string;
  caloriesPerPortion: number;
  proteinGPerPortion: number;
  carbsGPerPortion: number;
  fatGPerPortion: number;
  source: 'external' | 'user_created';
  createdByUserId: string | null;
}

export interface CreateCustomFoodItemInput {
  name: string;
  brand?: string | null;
  portionDescription: string;
  caloriesPerPortion: number;
  proteinGPerPortion: number;
  carbsGPerPortion: number;
  fatGPerPortion: number;
}

function result<T>(data: T | null, error: { message: string } | null): ApiResult<T> {
  return { data, error: error ? error.message : null };
}

export function toPersistedFoodItem(row: FoodItemRow): PersistedFoodItem {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    portionDescription: row.portion_description,
    caloriesPerPortion: row.calories_per_portion,
    proteinGPerPortion: row.protein_g_per_portion,
    carbsGPerPortion: row.carbs_g_per_portion,
    fatGPerPortion: row.fat_g_per_portion,
    source: row.source,
    createdByUserId: row.created_by_user_id,
  };
}

/**
 * FR-7.1/UX-7: free-text food search, the primary logging path alongside
 * barcode scan. RLS's `food_items_select_visible` policy already restricts
 * visible rows to `source='external'` or the caller's own custom foods, so
 * no manual user filtering is needed here.
 */
export async function searchFoodItems(
  client: GymSupabaseClient,
  query: string,
): Promise<ApiResult<PersistedFoodItem[]>> {
  const { data, error } = await client
    .from('food_items')
    .select('*')
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(25);
  if (error) {
    return result<PersistedFoodItem[]>(null, error);
  }
  return { data: (data ?? []).map(toPersistedFoodItem), error: null };
}

/**
 * FR-7.1/DR-2/A-7: a user-created custom food, private to its creator —
 * `food_items_insert_own_custom`'s RLS policy requires `source='user_created'`
 * paired with `created_by_user_id = auth.uid()`, enforced here explicitly
 * rather than left implicit.
 */
export async function createCustomFoodItem(
  client: GymSupabaseClient,
  userId: string,
  input: CreateCustomFoodItemInput,
): Promise<ApiResult<PersistedFoodItem>> {
  const { data, error } = await client
    .from('food_items')
    .insert({
      name: input.name,
      brand: input.brand ?? null,
      barcode: null,
      portion_description: input.portionDescription,
      calories_per_portion: input.caloriesPerPortion,
      protein_g_per_portion: input.proteinGPerPortion,
      carbs_g_per_portion: input.carbsGPerPortion,
      fat_g_per_portion: input.fatGPerPortion,
      source: 'user_created',
      created_by_user_id: userId,
    })
    .select()
    .single();
  if (error || !data) {
    return result<PersistedFoodItem>(null, error ?? { message: 'Failed to create custom food.' });
  }
  return { data: toPersistedFoodItem(data), error: null };
}
