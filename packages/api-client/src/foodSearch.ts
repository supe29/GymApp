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
  const terms = searchTerms(query);
  if (terms.length === 0) {
    return { data: [], error: null };
  }
  // Every word must appear somewhere in the name, in any order: USDA names
  // read "Chicken, broilers or fryers, breast, ..." so a single
  // `%chicken breast%` substring would miss them. Two candidate queries —
  // names starting with the first word, and names containing every word
  // anywhere — so a common word ("rice") can't fill the candidate cap with
  // alphabetically-early names that merely contain it. Then rank in JS.
  const containsAll = (prefixFirst: boolean) => {
    let request = client.from('food_items').select('*');
    terms.forEach((term, i) => {
      request = request.ilike('name', prefixFirst && i === 0 ? `${term}%` : `%${term}%`);
    });
    return request.order('name').limit(SEARCH_CANDIDATE_LIMIT);
  };
  const [prefixed, anywhere] = await Promise.all([containsAll(true), containsAll(false)]);
  const error = prefixed.error ?? anywhere.error;
  if (error) {
    return result<PersistedFoodItem[]>(null, error);
  }
  const byId = new Map<string, FoodItemRow>();
  for (const row of [...(prefixed.data ?? []), ...(anywhere.data ?? [])]) byId.set(row.id, row);
  const ranked = rankByRelevance([...byId.values()].map(toPersistedFoodItem), terms);
  return { data: ranked.slice(0, SEARCH_RESULT_LIMIT), error: null };
}

const SEARCH_RESULT_LIMIT = 25;
const SEARCH_CANDIDATE_LIMIT = 200;

function stem(word: string): string {
  return word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;
}

/**
 * Lowercased words of the query with LIKE wildcards removed; a trailing
 * plural "s" is dropped from longer words so "eggs" finds "Egg, whole".
 */
export function searchTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[%_\\]/g, ' ')
    .split(/[\s,]+/)
    .filter((word) => word.length > 0)
    .map(stem);
}

/** Words that mark a plain, unprocessed form — what most people mean by "rice" or "eggs". */
const BASIC_FORM = /\b(raw|cooked|roasted|boiled|plain|whole|fresh)\b/g;

/**
 * Most relevant first: names whose first word is the first search term
 * ("Egg, whole" before "Eggplant"), then names where every term starts a
 * word, then the most plain/basic-form words, then simpler names (fewer comma-separated
 * qualifiers, then shorter).
 */
function rankByRelevance(items: PersistedFoodItem[], terms: string[]): PersistedFoodItem[] {
  const score = (name: string): number[] => {
    const lower = name.toLowerCase();
    const words = lower.split(/[^a-z0-9%]+/).filter(Boolean);
    const firstWord = stem(words[0] ?? '');
    const startsAWord = (term: string) => words.some((w) => w.startsWith(term));
    return [
      firstWord === terms[0] ? 0 : startsAWord(terms[0]) ? 1 : 2,
      terms.every(startsAWord) ? 0 : 1,
      -(lower.match(BASIC_FORM)?.length ?? 0),
      name.split(',').length,
      name.length,
    ];
  };
  const scores = new Map(items.map((item) => [item.id, score(item.name)]));
  return [...items].sort((a, b) => {
    const sa = scores.get(a.id)!;
    const sb = scores.get(b.id)!;
    for (let i = 0; i < sa.length; i += 1) {
      if (sa[i] !== sb[i]) return sa[i] - sb[i];
    }
    return a.name.localeCompare(b.name);
  });
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
