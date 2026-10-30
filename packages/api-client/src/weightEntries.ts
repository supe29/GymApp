import type { GymSupabaseClient } from './client';
import type { ApiResult } from './profile';
import type { Database } from './types/database';

export type WeightEntryRow = Database['public']['Tables']['weight_entries']['Row'];

export interface PersistedWeightEntry {
  id: string;
  weightKg: number;
  measuredAt: string;
}

function toPersisted(row: WeightEntryRow): PersistedWeightEntry {
  return { id: row.id, weightKg: row.weight_kg, measuredAt: row.measured_at };
}

/** FR-8.1: logs a new body weight entry for right now. */
export async function logWeightEntry(
  client: GymSupabaseClient,
  userId: string,
  weightKg: number,
): Promise<ApiResult<PersistedWeightEntry>> {
  const { data, error } = await client
    .from('weight_entries')
    .insert({ user_id: userId, weight_kg: weightKg })
    .select()
    .single();
  if (error || !data) {
    return { data: null, error: error ? error.message : 'Failed to log weight entry.' };
  }
  return { data: toPersisted(data), error: null };
}

/** FR-8.1/AC-12: the user's weight entries, oldest first, for the trend chart. */
export async function getWeightEntries(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<PersistedWeightEntry[]>> {
  const { data, error } = await client
    .from('weight_entries')
    .select('*')
    .eq('user_id', userId)
    .order('measured_at');
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: (data ?? []).map(toPersisted), error: null };
}

/** FR-8.1: removes a weight entry (correcting a mistaken log is delete + re-log, no in-place edit). */
export async function deleteWeightEntry(
  client: GymSupabaseClient,
  userId: string,
  id: string,
): Promise<ApiResult<null>> {
  const { error } = await client.from('weight_entries').delete().eq('id', id).eq('user_id', userId);
  if (error) {
    return { data: null, error: error.message };
  }
  return { data: null, error: null };
}
