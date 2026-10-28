// ============================================================================
// ⚠️ TEMPORARY — DEVELOPMENT-ONLY — DO NOT SHIP ⚠️
// ============================================================================
// Mirrors DevMuscleExplorerHarness.tsx's precedent (Phase 4): lets Phase 5's
// WorkoutPlanScreen be visually inspected on web before Phase 11 builds real
// navigation and before a real Supabase project is configured. Unlike the
// Phase 4 harness (read-only fixture data), WorkoutPlanScreen also *writes*
// (generate/regenerate insert new plan versions), so this harness's fake
// client is a small stateful in-memory store rather than a static fixture —
// still only the subset of the PostgREST query builder api-client's plan
// functions actually call, not a general-purpose fake. This file changes NO
// business logic and adds NO product feature.
//
// Only reachable because navigation/AppNavigator.tsx guards this behind
// `__DEV__`. Delete this file and its AppNavigator.tsx wiring once Phase 11
// lands real navigation.
// ============================================================================

import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import WorkoutPlanScreen from '../features/plan/WorkoutPlanScreen';

const MUSCLE_GROUPS = [
  { id: 'mg-chest', key: 'chest' },
  { id: 'mg-biceps', key: 'biceps' },
  { id: 'mg-quadriceps', key: 'quadriceps' },
];

const EQUIPMENT_ITEMS = [{ id: 'eq-barbell', key: 'barbell' }];

const EXERCISES = [
  { id: 'ex-bench', name: 'Barbell Bench Press', difficulty: 'beginner', muscle_group_id: 'mg-chest', equipment_item_id: 'eq-barbell' },
  { id: 'ex-pushup', name: 'Push-Up', difficulty: 'beginner', muscle_group_id: 'mg-chest', equipment_item_id: null },
  { id: 'ex-curl', name: 'Barbell Curl', difficulty: 'beginner', muscle_group_id: 'mg-biceps', equipment_item_id: 'eq-barbell' },
  { id: 'ex-squat', name: 'Bodyweight Squat', difficulty: 'beginner', muscle_group_id: 'mg-quadriceps', equipment_item_id: null },
] as const;

const DEV_USER_ID = 'dev-harness-user';

type Row = Record<string, unknown>;

/** A tiny stateful in-memory table store, seeded once per harness mount. */
function createInMemoryDb() {
  let nextId = 1;
  const tables: Record<string, Row[]> = {
    profiles: [
      {
        user_id: DEV_USER_ID,
        goal: 'general_fitness',
        fitness_level: 'beginner',
        training_days_per_week: 3,
      },
    ],
    user_equipment: EQUIPMENT_ITEMS.map((e) => ({ user_id: DEV_USER_ID, equipment_item_id: e.id })),
    equipment_items: EQUIPMENT_ITEMS,
    exercises: EXERCISES.map((e) => ({ id: e.id, name: e.name, instructions: null, difficulty: e.difficulty })),
    exercise_muscles: EXERCISES.map((e) => ({ exercise_id: e.id, muscle_group_id: e.muscle_group_id, role: 'primary' })),
    muscle_groups: MUSCLE_GROUPS,
    exercise_equipment: EXERCISES.filter((e) => e.equipment_item_id).map((e) => ({
      exercise_id: e.id,
      equipment_item_id: e.equipment_item_id,
    })),
    workout_plans: [],
    planned_sessions: [],
    planned_session_exercises: [],
  };

  function insertRow(table: string, row: Row): Row {
    const withId: Row = { id: `${table}-${nextId++}`, created_at: new Date().toISOString(), ...row };
    if (table === 'workout_plans') {
      const userVersions = tables.workout_plans
        .filter((r) => r.user_id === row.user_id)
        .map((r) => r.plan_version as number);
      withId.plan_version = userVersions.length > 0 ? Math.max(...userVersions) + 1 : 1;
      withId.effective_from = withId.created_at;
      withId.superseded_at = null;
    }
    tables[table] = [...tables[table], withId];
    return withId;
  }

  return { tables, insertRow };
}

interface Filter {
  (row: Row): boolean;
}

function createQueryBuilder(db: ReturnType<typeof createInMemoryDb>, table: string) {
  const filters: Filter[] = [];
  let insertPayload: Row[] | null = null;
  let orderSpec: { col: string; ascending: boolean } | null = null;
  let limitCount: number | null = null;

  async function resolveRows(): Promise<Row[]> {
    if (insertPayload) {
      return insertPayload.map((row) => db.insertRow(table, row));
    }
    let rows = db.tables[table] ?? [];
    for (const f of filters) rows = rows.filter(f);
    if (orderSpec) {
      const { col, ascending } = orderSpec;
      rows = [...rows].sort((a, b) => {
        const diff = (a[col] as number) > (b[col] as number) ? 1 : (a[col] as number) < (b[col] as number) ? -1 : 0;
        return ascending ? diff : -diff;
      });
    }
    if (limitCount != null) rows = rows.slice(0, limitCount);
    return rows;
  }

  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push((row) => row[col] === val);
      return builder;
    },
    is: (col: string, val: unknown) => {
      filters.push((row) => row[col] === val);
      return builder;
    },
    in: (col: string, values: unknown[]) => {
      const set = new Set(values);
      filters.push((row) => set.has(row[col]));
      return builder;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderSpec = { col, ascending: opts?.ascending !== false };
      return builder;
    },
    limit: (n: number) => {
      limitCount = n;
      return builder;
    },
    insert: (payload: Row | Row[]) => {
      insertPayload = Array.isArray(payload) ? payload : [payload];
      return builder;
    },
    maybeSingle: async () => {
      const rows = await resolveRows();
      return { data: rows[0] ?? null, error: null };
    },
    single: async () => {
      const rows = await resolveRows();
      return { data: rows[0] ?? null, error: null };
    },
    then: (resolve: (v: { data: Row[]; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
      resolveRows().then((rows) => resolve({ data: rows, error: null }), reject),
  };
  return builder;
}

export default function DevWorkoutPlanHarness() {
  // Lazy-initialized once and kept stable across re-renders — WorkoutPlanScreen
  // writes to this store (generate/regenerate), so it must not reset on
  // every render the way a plain function-body variable would.
  const [fakeClient] = useState(() => {
    const db = createInMemoryDb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { from: (table: string) => createQueryBuilder(db, table) } as any;
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.banner} testID="dev-harness-banner">
        <Text style={styles.bannerText}>
          DEV MODE — temporary harness, fixture data, not a real backend
        </Text>
      </View>
      <WorkoutPlanScreen client={fakeClient} userId={DEV_USER_ID} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  banner: { backgroundColor: '#ffec99', padding: 6, alignItems: 'center' },
  bannerText: { fontSize: 12, fontWeight: '700', color: '#664d03' },
});
