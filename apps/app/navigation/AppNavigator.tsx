import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import SignInScreen from '../features/auth/SignInScreen';
import AuthGate from './AuthGate';
import DevMuscleExplorerHarness from './DevMuscleExplorerHarness';
import DevWorkoutPlanHarness from './DevWorkoutPlanHarness';

/**
 * Enforces FR-9.4 (no functionality reachable without signing in) for
 * real, using the actual auth/profile screens built in Phase 2. Real
 * multi-screen routing (switching between sign in/up/reset, onboarding,
 * dashboard, etc.) is a real navigation library wired in by Phase 11 —
 * this is deliberately not that yet, the same way Phase 0 left this file
 * as a placeholder for the phases that would build real screens.
 *
 * ⚠️ TEMPORARY DEV-ONLY BRANCH — see DevMuscleExplorerHarness.tsx and
 * DevWorkoutPlanHarness.tsx. Guarded by `__DEV__` (always false in a
 * production build) so Phase 4's and Phase 5's screens can be inspected
 * on web before Phase 11 exists and before a real Supabase project is
 * configured. Delete this branch when Phase 11 lands.
 */
export default function AppNavigator() {
  const [devHarness, setDevHarness] = useState<'muscle-explorer' | 'workout-plan'>('muscle-explorer');

  if (__DEV__) {
    return (
      <View style={styles.devContainer}>
        <View style={styles.devSwitcher} testID="dev-harness-switcher">
          <Pressable
            testID="dev-harness-switch-muscle-explorer"
            style={styles.devSwitchButton}
            onPress={() => setDevHarness('muscle-explorer')}
          >
            <Text style={styles.devSwitchText}>Muscle Explorer</Text>
          </Pressable>
          <Pressable
            testID="dev-harness-switch-workout-plan"
            style={styles.devSwitchButton}
            onPress={() => setDevHarness('workout-plan')}
          >
            <Text style={styles.devSwitchText}>Workout Plan</Text>
          </Pressable>
        </View>
        {devHarness === 'muscle-explorer' ? <DevMuscleExplorerHarness /> : <DevWorkoutPlanHarness />}
      </View>
    );
  }

  return (
    <AuthGate renderSignedOut={() => <SignInScreen />}>
      <View style={styles.container}>
        <Text style={styles.title}>AI Fitness Coach</Text>
        <Text>Signed in — dashboard and full navigation are built in Phase 11.</Text>
      </View>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  devContainer: { flex: 1 },
  devSwitcher: { flexDirection: 'row', backgroundColor: '#222' },
  devSwitchButton: { flex: 1, padding: 10, alignItems: 'center' },
  devSwitchText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
