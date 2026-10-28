// ============================================================================
// ⚠️ TEMPORARY — DEVELOPMENT-ONLY — DO NOT SHIP ⚠️
// ============================================================================
// Exists solely so Phase 4's screens can be visually inspected on web before
// Phase 11 builds real navigation and before a real Supabase project is
// configured (see .env.example — no .env exists in this environment, which
// is *why* the app was blank: AppNavigator rendered <AuthGate>, whose
// default `client` prop calls getSupabaseClient(), which throws with no
// error boundary to catch it when EXPO_PUBLIC_SUPABASE_URL/ANON_KEY are
// unset). This file changes NO business logic and adds NO product feature:
// it wires already-built Phase 4 screens to a fake, in-memory
// GymSupabaseClient via the same `client` dependency-injection prop the
// screens' own tests already use, so they can render without a real
// backend.
//
// Only reachable because navigation/AppNavigator.tsx guards this behind
// `__DEV__` (Expo/RN's built-in flag — always false in a production/release
// build). Delete this file and the __DEV__ branch in AppNavigator.tsx once
// Phase 11 lands real navigation.
// ============================================================================

import type { ExerciseWithTags } from 'core';
import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import ExerciseDetailScreen from '../features/exercise-library/ExerciseDetailScreen';
import MuscleExplorerScreen from '../features/muscle-explorer/MuscleExplorerScreen';

// --- Fixture data (Phase 3's real taxonomy keys, trimmed to a few rows) ---

const MUSCLE_GROUPS = [
  { id: 'mg-chest', key: 'chest', display_name: 'Chest', created_at: '' },
  { id: 'mg-biceps', key: 'biceps', display_name: 'Biceps', created_at: '' },
  { id: 'mg-quadriceps', key: 'quadriceps', display_name: 'Quadriceps', created_at: '' },
];

const EQUIPMENT_ITEMS = [
  { id: 'eq-barbell', key: 'barbell', display_name: 'Barbell', category: 'free_weights' as const, created_at: '' },
];

const EXERCISES = [
  { id: 'ex-bench', name: 'Barbell Bench Press', instructions: 'Lie on the bench.\nLower the bar to your chest.\nPress back up.', difficulty: 'beginner', muscle_group_id: 'mg-chest', equipment_item_id: 'eq-barbell' },
  { id: 'ex-pushup', name: 'Push-Up', instructions: 'Hands under shoulders.\nLower your chest to the floor.\nPress back up.', difficulty: 'beginner', muscle_group_id: 'mg-chest', equipment_item_id: null },
  { id: 'ex-curl', name: 'Barbell Curl', instructions: 'Hold the bar with an underhand grip.\nCurl up.\nLower with control.', difficulty: 'beginner', muscle_group_id: 'mg-biceps', equipment_item_id: 'eq-barbell' },
  { id: 'ex-squat', name: 'Bodyweight Squat', instructions: 'Feet shoulder-width apart.\nSit back and down.\nStand back up.', difficulty: 'beginner', muscle_group_id: 'mg-quadriceps', equipment_item_id: null },
] as const;

/** Chainable stub matching the subset of the PostgREST query builder api-client's functions call (select/eq/order, and thenable). */
function queryResult(data: unknown) {
  const result = { data, error: null };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

/** A fake GymSupabaseClient, passed via the same `client` prop the real screens' own tests use — no screen code changes needed. */
const fakeClient = {
  from(table: string) {
    switch (table) {
      case 'muscle_groups':
        return queryResult(MUSCLE_GROUPS.map(({ id, key }) => ({ id, key })));
      case 'exercises':
        return queryResult(
          EXERCISES.map((e) => ({
            id: e.id,
            name: e.name,
            instructions: e.instructions,
            difficulty: e.difficulty,
          })),
        );
      case 'exercise_muscles':
        return queryResult(
          EXERCISES.map((e) => ({
            exercise_id: e.id,
            muscle_group_id: e.muscle_group_id,
            role: 'primary',
          })),
        );
      case 'exercise_equipment':
        return queryResult(
          EXERCISES.filter((e) => e.equipment_item_id).map((e) => ({
            exercise_id: e.id,
            equipment_item_id: e.equipment_item_id,
          })),
        );
      case 'equipment_items':
        return queryResult(EQUIPMENT_ITEMS);
      case 'user_equipment':
        return queryResult(EQUIPMENT_ITEMS.map((e) => ({ equipment_item_id: e.id })));
      default:
        return queryResult([]);
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

export default function DevMuscleExplorerHarness() {
  const [selectedExercise, setSelectedExercise] = useState<ExerciseWithTags | null>(null);

  if (selectedExercise) {
    return (
      <SafeAreaView style={styles.container}>
        <Pressable
          testID="dev-harness-back-to-explorer"
          style={styles.banner}
          onPress={() => setSelectedExercise(null)}
        >
          <Text style={styles.bannerText}>DEV MODE — ← Back to Muscle Explorer</Text>
        </Pressable>
        <ExerciseDetailScreen exercise={selectedExercise} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.banner} testID="dev-harness-banner">
        <Text style={styles.bannerText}>
          DEV MODE — temporary harness, fixture data, not a real backend
        </Text>
      </View>
      <MuscleExplorerScreen
        client={fakeClient}
        userId="dev-harness-user"
        onSelectExercise={setSelectedExercise}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  banner: { backgroundColor: '#ffec99', padding: 6, alignItems: 'center' },
  bannerText: { fontSize: 12, fontWeight: '700', color: '#664d03' },
});
