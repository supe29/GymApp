import type { GymSupabaseClient } from './client';
import type { Database } from './types/database';

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type EquipmentItemRow = Database['public']['Tables']['equipment_items']['Row'];

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
}

function result<T>(data: T | null, error: { message: string } | null): ApiResult<T> {
  return { data, error: error ? error.message : null };
}

/** FR-1.1/FR-1.3: fetch the signed-in user's profile, or null if onboarding hasn't been completed yet. */
export async function getProfile(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<ProfileRow>> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return result(data, error);
}

/** FR-1.1: create the profile row on onboarding completion. */
export async function createProfile(
  client: GymSupabaseClient,
  input: ProfileInsert,
): Promise<ApiResult<ProfileRow>> {
  const { data, error } = await client.from('profiles').insert(input).select().single();
  return result(data, error);
}

/** FR-1.3: edit profile fields after account creation. */
export async function updateProfile(
  client: GymSupabaseClient,
  userId: string,
  patch: Partial<Omit<ProfileInsert, 'user_id'>>,
): Promise<ApiResult<ProfileRow>> {
  const { data, error } = await client
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select()
    .single();
  return result(data, error);
}

/** FR-1.2: the fixed reference list of equipment items, for building the checklist UI. */
export async function listEquipmentItems(
  client: GymSupabaseClient,
): Promise<ApiResult<EquipmentItemRow[]>> {
  const { data, error } = await client
    .from('equipment_items')
    .select('*')
    .order('category')
    .order('display_name');
  return result(data ?? [], error);
}

/** FR-1.2: the signed-in user's currently declared equipment item ids. */
export async function getUserEquipmentIds(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<string[]>> {
  const { data, error } = await client
    .from('user_equipment')
    .select('equipment_item_id')
    .eq('user_id', userId);
  return result(data ? data.map((row) => row.equipment_item_id) : [], error);
}

/**
 * FR-1.2: replace the user's full equipment selection with `equipmentItemIds`.
 * Implemented as delete-then-insert rather than a diff, which is simple and
 * correct but not atomic across the two calls; acceptable for a
 * single-user, single-session edit flow with no concurrent writers.
 */
export async function setUserEquipment(
  client: GymSupabaseClient,
  userId: string,
  equipmentItemIds: string[],
): Promise<{ error: string | null }> {
  const { error: deleteError } = await client
    .from('user_equipment')
    .delete()
    .eq('user_id', userId);
  if (deleteError) {
    return { error: deleteError.message };
  }

  if (equipmentItemIds.length === 0) {
    return { error: null };
  }

  const { error: insertError } = await client.from('user_equipment').insert(
    equipmentItemIds.map((equipmentItemId) => ({
      user_id: userId,
      equipment_item_id: equipmentItemId,
    })),
  );
  return { error: insertError ? insertError.message : null };
}

/**
 * FR-9.3: request account deletion. Calls the delete-account edge function
 * (running with service-role privileges — see
 * /supabase/functions/delete-account/index.ts) rather than deleting the
 * profile row directly, since regular users cannot delete their own
 * profile row under RLS (see /supabase/migrations/0008_rls_policies.sql —
 * this is deliberate, not a bug: account deletion must go through the
 * auth admin API so the underlying auth.users record is removed too).
 */
export async function requestAccountDeletion(
  client: GymSupabaseClient,
): Promise<{ error: string | null }> {
  const { error } = await client.functions.invoke('delete-account', { method: 'POST' });
  return { error: error ? error.message : null };
}
