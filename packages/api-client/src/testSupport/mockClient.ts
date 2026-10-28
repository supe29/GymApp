// Test-only helpers for mocking a GymSupabaseClient without hitting a
// real Supabase backend. Used by auth.test.ts, profile.test.ts,
// exercises.test.ts, and plans.test.ts.
import type { GymSupabaseClient } from '../client';

/**
 * A fluent query-builder mock: every chaining method returns itself, and
 * it is thenable so `await builder` resolves to `result` even when the
 * caller never invokes a terminal method like `.single()` — matching how
 * real supabase-js PostgrestFilterBuilder instances behave.
 */
export function createQueryBuilderMock(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    is: jest.fn(() => builder),
    in: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => builder),
    insert: jest.fn(() => builder),
    upsert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single: jest.fn(() => Promise.resolve(result)),
    then: (
      resolve: (value: typeof result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

export function createMockClient() {
  const auth = {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    signInWithOAuth: jest.fn(),
    exchangeCodeForSession: jest.fn(),
    resetPasswordForEmail: jest.fn(),
    updateUser: jest.fn(),
    signOut: jest.fn(),
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(),
  };
  const functions = { invoke: jest.fn() };
  const from = jest.fn();

  const client = { auth, from, functions } as unknown as GymSupabaseClient;
  return { client, auth, from, functions };
}
