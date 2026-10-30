import { NavigationContainer } from '@react-navigation/native';
import { getProfile, getSession, type GymSupabaseClient } from 'api-client';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import OnboardingFlow from '../features/onboarding/OnboardingFlow';
import { getSupabaseClient } from '../lib/supabaseClient';
import AuthGate from './AuthGate';
import AuthNavigator from './AuthNavigator';
import MainTabs from './MainTabs';

/**
 * FR-9.4/UX-1/UX-3: the real signed-in router. `AuthGate` only tracks
 * whether a session exists, not who the user is, so this component
 * resolves the session's user id itself, then decides onboarding vs. the
 * main app by checking whether a profile row exists yet (one-time —
 * flipping `hasProfile` locally once `OnboardingFlow` completes avoids a
 * redundant re-fetch).
 */
function SignedInRouter({ client }: { client: GymSupabaseClient }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    getSession(client).then((session) => {
      if (!mounted || !session) return;
      const uid = session.user.id;
      setUserId(uid);
      getProfile(client, uid).then((result) => {
        if (mounted) {
          setHasProfile(result.data != null);
        }
      });
    });
    return () => {
      mounted = false;
    };
  }, [client]);

  if (!userId || hasProfile === undefined) {
    return (
      <View style={styles.container}>
        <Text testID="app-loading">Loading...</Text>
      </View>
    );
  }

  if (!hasProfile) {
    return <OnboardingFlow client={client} userId={userId} onComplete={() => setHasProfile(true)} />;
  }

  return <MainTabs client={client} userId={userId} />;
}

/** Enforces FR-9.4 (no functionality reachable without signing in) for real. */
export default function AppNavigator() {
  const client = getSupabaseClient();

  return (
    <NavigationContainer>
      <AuthGate client={client} renderSignedOut={() => <AuthNavigator client={client} />}>
        <SignedInRouter client={client} />
      </AuthGate>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
