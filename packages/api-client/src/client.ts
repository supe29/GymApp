import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './types/database';

export type GymSupabaseClient = SupabaseClient<Database>;

/** Matches both `@react-native-async-storage/async-storage`'s API and the browser default. */
export interface GymClientStorage {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
}

export interface CreateGymClientOptions {
  /** Defaults to process.env.EXPO_PUBLIC_SUPABASE_URL */
  url?: string;
  /** Defaults to process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY */
  anonKey?: string;
  /**
   * Session-persistence storage. Required on native (pass
   * `@react-native-async-storage/async-storage`) since there is no
   * browser storage to fall back on; omit on web to use supabase-js's
   * default (localStorage). Kept injectable so this platform-agnostic
   * package never imports a native-only module itself.
   */
  storage?: GymClientStorage;
}

/**
 * Creates the typed Supabase client used by the app. Always uses the
 * public anon key — this client authenticates as the signed-in user via
 * their session token, and Row Level Security (see
 * /supabase/migrations/0008_rls_policies.sql) is what actually restricts
 * access, not this key. The service-role key must never be used from
 * client code (see .env.example).
 */
export function createGymClient(options: CreateGymClientOptions = {}): GymSupabaseClient {
  const url = options.url ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = options.anonKey ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing Supabase configuration: set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example), or pass them explicitly.',
    );
  }

  return createClient<Database>(url, anonKey, {
    auth: options.storage
      ? {
          storage: options.storage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        }
      : undefined,
  });
}
