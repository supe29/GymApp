import * as Linking from 'expo-linking';

/** The URL Supabase's hosted OAuth flow (Google/Apple) redirects back to. */
export function getAuthRedirectUrl(): string {
  return Linking.createURL('auth-callback');
}
