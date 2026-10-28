import AsyncStorage from '@react-native-async-storage/async-storage';
import { createGymClient, type GymSupabaseClient } from 'api-client';
import { Platform } from 'react-native';

let client: GymSupabaseClient | undefined;

/**
 * Lazily-created singleton so importing this module never throws (e.g. in
 * tests, where EXPO_PUBLIC_SUPABASE_URL/ANON_KEY aren't set) — only
 * calling getSupabaseClient() does, and only the first time.
 */
export function getSupabaseClient(): GymSupabaseClient {
  if (!client) {
    client = createGymClient({
      // No browser storage exists on native; AsyncStorage is required
      // there for session persistence. On web, omit it to use
      // supabase-js's own localStorage default.
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    });
  }
  return client;
}
