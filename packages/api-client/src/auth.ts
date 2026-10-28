import type { Session, User } from '@supabase/supabase-js';

import type { GymSupabaseClient } from './client';

export interface AuthResult {
  user: User | null;
  session: Session | null;
  error: string | null;
}

function toResult(data: { user: User | null; session: Session | null }, error: { message: string } | null): AuthResult {
  return {
    user: data.user,
    session: data.session,
    error: error ? error.message : null,
  };
}

/** FR-9.1: email/password sign-up. */
export async function signUpWithEmail(
  client: GymSupabaseClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  const { data, error } = await client.auth.signUp({ email, password });
  return toResult(data, error);
}

/** FR-9.1: email/password sign-in. */
export async function signInWithEmail(
  client: GymSupabaseClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  return toResult(data, error);
}

export interface OAuthResult {
  url: string | null;
  error: string | null;
}

/**
 * FR-9.1: Google sign-in via Supabase's hosted OAuth flow. The caller is
 * responsible for opening `url` in a browser/web-view (e.g. via
 * expo-web-browser on native) and completing the session once the redirect
 * lands back in the app — this function only starts the flow.
 */
export async function signInWithGoogle(
  client: GymSupabaseClient,
  redirectTo: string,
): Promise<OAuthResult> {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  return { url: data.url, error: error ? error.message : null };
}

/** FR-9.1: Apple sign-in, same hosted-OAuth-flow shape as Google above. */
export async function signInWithApple(
  client: GymSupabaseClient,
  redirectTo: string,
): Promise<OAuthResult> {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  return { url: data.url, error: error ? error.message : null };
}

/** Completes an OAuth redirect by exchanging the returned URL for a session. */
export async function exchangeOAuthRedirectForSession(
  client: GymSupabaseClient,
  redirectUrl: string,
): Promise<AuthResult> {
  const { data, error } = await client.auth.exchangeCodeForSession(redirectUrl);
  return toResult(data, error);
}

/** FR-9.2: request a password-reset email. */
export async function requestPasswordReset(
  client: GymSupabaseClient,
  email: string,
  redirectTo: string,
): Promise<{ error: string | null }> {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  return { error: error ? error.message : null };
}

/** FR-9.2: set a new password once the user has followed the reset-email link. */
export async function updatePassword(
  client: GymSupabaseClient,
  newPassword: string,
): Promise<{ error: string | null }> {
  const { error } = await client.auth.updateUser({ password: newPassword });
  return { error: error ? error.message : null };
}

export async function signOut(client: GymSupabaseClient): Promise<{ error: string | null }> {
  const { error } = await client.auth.signOut();
  return { error: error ? error.message : null };
}

/** FR-9.4: the current session, or null if signed out — the basis for gating all app routes. */
export async function getSession(client: GymSupabaseClient): Promise<Session | null> {
  const { data } = await client.auth.getSession();
  return data.session;
}

export function onAuthStateChange(
  client: GymSupabaseClient,
  callback: (session: Session | null) => void,
): { unsubscribe: () => void } {
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return { unsubscribe: () => subscription.unsubscribe() };
}
