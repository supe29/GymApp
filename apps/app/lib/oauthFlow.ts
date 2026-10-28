import {
  type AuthResult,
  exchangeOAuthRedirectForSession,
  type GymSupabaseClient,
  signInWithApple,
  signInWithGoogle,
} from 'api-client';
import * as WebBrowser from 'expo-web-browser';

import { getAuthRedirectUrl } from './authRedirect';

/**
 * FR-9.1: Google/Apple sign-in. Supabase's hosted OAuth flow doesn't
 * distinguish "sign up" from "sign in" — the account is created on first
 * use — so this one function backs both SignUpScreen and SignInScreen.
 */
export async function performOAuthSignIn(
  client: GymSupabaseClient,
  provider: 'google' | 'apple',
): Promise<AuthResult> {
  const redirectTo = getAuthRedirectUrl();
  const start = provider === 'google' ? signInWithGoogle : signInWithApple;
  const { url, error } = await start(client, redirectTo);
  if (error || !url) {
    return { user: null, session: null, error: error ?? 'Could not start sign-in.' };
  }

  const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
  if (result.type !== 'success' || !('url' in result) || !result.url) {
    const cancelled = result.type === 'cancel' || result.type === 'dismiss';
    return { user: null, session: null, error: cancelled ? null : 'Sign-in was not completed.' };
  }

  return exchangeOAuthRedirectForSession(client, result.url);
}
