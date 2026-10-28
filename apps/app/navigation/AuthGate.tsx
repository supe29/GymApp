import { getSession, onAuthStateChange, type GymSupabaseClient } from 'api-client';
import { type ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getSupabaseClient } from '../lib/supabaseClient';

export interface AuthGateProps {
  client?: GymSupabaseClient;
  children: ReactNode;
  renderSignedOut: () => ReactNode;
}

/**
 * FR-9.4: no app functionality is reachable without a signed-in session.
 * `children` (the real app — onboarding, dashboard, etc., wired in by
 * Phase 11) is only ever rendered when there is an active session;
 * otherwise `renderSignedOut()` (the auth stack: sign in/up/reset) is
 * rendered instead.
 */
export default function AuthGate({
  client = getSupabaseClient(),
  children,
  renderSignedOut,
}: AuthGateProps) {
  // undefined = still checking; null = signed out; object = signed in.
  const [hasSession, setHasSession] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let mounted = true;

    getSession(client).then((session) => {
      if (mounted) {
        setHasSession(session !== null);
      }
    });

    const { unsubscribe } = onAuthStateChange(client, (session) => {
      if (mounted) {
        setHasSession(session !== null);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [client]);

  if (hasSession === undefined) {
    return (
      <View style={styles.container}>
        <Text testID="auth-gate-loading">Loading...</Text>
      </View>
    );
  }

  if (!hasSession) {
    return <>{renderSignedOut()}</>;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
