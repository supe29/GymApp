import type { GymSupabaseClient } from './client';
import type { ApiResult } from './profile';
import { toPersistedFoodItem, type PersistedFoodItem } from './foodSearch';

/**
 * FR-7.1/AC-9/AC-10: exact-match barcode lookup against `food_items`. A
 * not-found barcode is NOT an error — it's a legitimate outcome the caller
 * must route to manual search/entry (FR-7.4), so `data: null, error: null`
 * is returned rather than throwing/erroring.
 */
export async function lookupFoodByBarcode(
  client: GymSupabaseClient,
  barcode: string,
): Promise<ApiResult<PersistedFoodItem | null>> {
  const { data, error } = await client.from('food_items').select('*').eq('barcode', barcode).maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data ? toPersistedFoodItem(data) : null, error: null };
}
