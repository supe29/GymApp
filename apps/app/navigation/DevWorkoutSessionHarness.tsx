// ============================================================================
// ⚠️ TEMPORARY — DEVELOPMENT-ONLY — DO NOT SHIP ⚠️
// ============================================================================
// Mirrors DevWorkoutPlanHarness.tsx's precedent (Phase 5): lets Phase 7's
// session-logging screens be visually inspected on web before Phase 11
// builds real navigation. Extends that harness's in-memory fake-client
// pattern with `update`/`upsert` support (workout_sessions/set_logs need
// both — see packages/api-client/src/workoutSessions.ts) on top of the
// existing `insert`/`select` support. This file changes NO business logic
// and adds NO product feature.
//
// Only reachable because navigation/AppNavigator.tsx guards this behind
// `__DEV__`. Delete this file and its AppNavigator.tsx wiring once Phase 11
// lands real navigation.
// ============================================================================

import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import WorkoutHistoryScreen from '../features/history/WorkoutHistoryScreen';
import FreeformSessionScreen from '../features/workout-session/FreeformSessionScreen';

const MUSCLE_GROUPS = [
  { id: 'mg-chest', key: 'chest' },
  { id: 'mg-quadriceps', key: 'quadriceps' },
];

const EQUIPMENT_ITEMS = [{ id: 'eq-barbell', key: 'barbell' }];

const EXERCISES = [
  { id: 'ex-bench', name: 'Barbell Bench Press', difficulty: 'beginner', muscle_group_id: 'mg-chest', equipment_item_id: 'eq-barbell' },
  { id: 'ex-pushup', name: 'Push-Up', difficulty: 'beginner', muscle_group_id: 'mg-chest', equipment_item_id: null },
  { id: 'ex-squat', name: 'Bodyweight Squat', difficulty: 'beginner', muscle_group_id: 'mg-quadriceps', equipment_item_id: null },
] as const;

const DEV_USER_ID = 'dev-harness-user';

type Row = Record<string, unknown>;

/** A tiny stateful in-memory table store, seeded once per harness mount. */
function createInMemoryDb() {
  let nextId = 1;
  const tables: Record<string, Row[]> = {
    user_equipment: EQUIPMENT_ITEMS.map((e) => ({ user_id: DEV_USER_ID, equipment_item_id: e.id })),
    equipment_items: EQUIPMENT_ITEMS,
    exercises: EXERCISES.map((e) => ({ id: e.id, name: e.name, instructions: null, difficulty: e.difficulty })),
    exercise_muscles: EXERCISES.map((e) => ({ exercise_id: e.id, muscle_group_id: e.muscle_group_id, role: 'primary' })),
    muscle_groups: MUSCLE_GROUPS,
    exercise_equipment: EXERCISES.filter((e) => e.equipment_item_id).map((e) => ({
      exercise_id: e.id,
      equipment_item_id: e.equipment_item_id,
    })),
    workout_sessions: [],
    set_logs: [],
  };

  function insertRow(table: string, row: Row): Row {
    const withId: Row = { id: (row.id as string | undefined) ?? `${table}-${nextId++}`, created_at: new Date().toISOString(), ...row };
    tables[table] = [...tables[table].filter((r) => r.id !== withId.id), withId];
    return withId;
  }

  function updateRows(table: string, matches: (row: Row) => boolean, patch: Row): Row[] {
    const updated: Row[] = [];
    tables[table] = tables[table].map((row) => {
      if (!matches(row)) return row;
      const next = { ...row, ...patch };
      updated.push(next);
      return next;
    });
    return updated;
  }

  return { tables, insertRow, updateRows };
}

interface Filter {
  (row: Row): boolean;
}

function createQueryBuilder(db: ReturnType<typeof createInMemoryDb>, table: string) {
  const filters: Filter[] = [];
  let insertPayload: Row[] | null = null;
  let upsertPayload: Row | null = null;
  let updatePatch: Row | null = null;
  let orderSpec: { col: string; ascending: boolean } | null = null;
  let limitCount: number | null = null;

  async function resolveRows(): Promise<Row[]> {
    if (insertPayload) {
      return insertPayload.map((row) => db.insertRow(table, row));
    }
    if (upsertPayload) {
      return [db.insertRow(table, upsertPayload)];
    }
    if (updatePatch) {
      const matchFn = (row: Row) => filters.every((f) => f(row));
      return db.updateRows(table, matchFn, updatePatch);
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
    upsert: (payload: Row) => {
      upsertPayload = payload;
      return builder;
    },
    update: (patch: Row) => {
      updatePatch = patch;
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

type DevView = 'freeform-session' | 'history';

export default function DevWorkoutSessionHarness() {
  const [view, setView] = useState<DevView>('freeform-session');
  // Lazy-initialized once and kept stable across re-renders/view switches —
  // FreeformSessionScreen writes sessions/set logs to this store, and
  // WorkoutHistoryScreen needs to read back what was written.
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
      <View style={styles.viewSwitcher}>
        <Pressable testID="dev-session-harness-view-freeform" style={styles.viewButton} onPress={() => setView('freeform-session')}>
          <Text style={styles.viewButtonText}>Freeform Session</Text>
        </Pressable>
        <Pressable testID="dev-session-harness-view-history" style={styles.viewButton} onPress={() => setView('history')}>
          <Text style={styles.viewButtonText}>History</Text>
        </Pressable>
      </View>
      {view === 'freeform-session' ? (
        <FreeformSessionScreen client={fakeClient} userId={DEV_USER_ID} onSessionCompleted={() => setView('history')} />
      ) : (
        <WorkoutHistoryScreen client={fakeClient} userId={DEV_USER_ID} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  banner: { backgroundColor: '#ffec99', padding: 6, alignItems: 'center' },
  bannerText: { fontSize: 12, fontWeight: '700', color: '#664d03' },
  viewSwitcher: { flexDirection: 'row', backgroundColor: '#444' },
  viewButton: { flex: 1, padding: 10, alignItems: 'center' },
  viewButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
