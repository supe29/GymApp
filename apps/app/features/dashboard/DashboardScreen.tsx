import {
  getCurrentNutritionTargets,
  getCurrentPlan,
  getFoodLogEntriesForDate,
  getPersonalRecordsForUser,
  getProfile,
  getWorkoutSessionHistory,
  type GymSupabaseClient,
  type PersistedNutritionTargets,
  type PersistedPlan,
  type PersonalRecordWithExerciseName,
} from 'api-client';
import { computeDailyTotals, determineNextPlannedSession, formatWeight, type UnitPreference } from 'core';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export interface DashboardScreenProps {
  client: GymSupabaseClient;
  userId: string;
  onStartSession?: (plannedSessionId: string) => void;
  onStartFreeform?: () => void;
  onLogFood?: () => void;
  onLogWeight?: () => void;
  onViewHistory?: () => void;
  onBrowseMuscles?: () => void;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * UX-3/UX-6: the home dashboard — today's planned session, today's
 * nutrition progress, quick-log actions, and (UX-6's "not only on a stats
 * screen" reading, additive to the existing end-of-session review cards
 * from Phases 8/10) the most recent personal record, if any.
 */
export default function DashboardScreen({
  client,
  userId,
  onStartSession,
  onStartFreeform,
  onLogFood,
  onLogWeight,
  onViewHistory,
  onBrowseMuscles,
}: DashboardScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [plan, setPlan] = useState<PersistedPlan | null>(null);
  const [completedPlannedSessionIds, setCompletedPlannedSessionIds] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<PersistedNutritionTargets | null>(null);
  const [totals, setTotals] = useState({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  const [mostRecentPr, setMostRecentPr] = useState<PersonalRecordWithExerciseName | null>(null);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>('metric');

  useEffect(() => {
    async function load() {
      const [planRes, historyRes, targetsRes, foodRes, prRes, profileRes] = await Promise.all([
        getCurrentPlan(client, userId),
        getWorkoutSessionHistory(client, userId),
        getCurrentNutritionTargets(client, userId),
        getFoodLogEntriesForDate(client, userId, todayDateString()),
        getPersonalRecordsForUser(client, userId),
        getProfile(client, userId),
      ]);

      setPlan(planRes.data ?? null);
      const completed = new Set(
        (historyRes.data ?? [])
          .filter((entry) => entry.session.status === 'completed' && entry.session.plannedSessionId)
          .map((entry) => entry.session.plannedSessionId as string),
      );
      setCompletedPlannedSessionIds(completed);
      setTargets(targetsRes.data ?? null);
      setTotals(computeDailyTotals(foodRes.data ?? []));

      const records = prRes.data ?? [];
      if (records.length > 0) {
        const latest = records.reduce((a, b) => (Date.parse(a.achievedAt) > Date.parse(b.achievedAt) ? a : b));
        setMostRecentPr(latest);
      }
      if (profileRes.data) {
        setUnitPreference(profileRes.data.unit_preference);
      }
      setLoaded(true);
    }
    load();
  }, [client, userId]);

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="dashboard-loading">Loading...</Text>
      </View>
    );
  }

  const nextSession = plan ? determineNextPlannedSession(plan.sessions, completedPlannedSessionIds) : null;

  return (
    <ScrollView style={styles.container} testID="dashboard-screen">
      <Text style={styles.title}>Dashboard</Text>

      {nextSession ? (
        <View testID="dashboard-next-session" style={styles.card}>
          <Text style={styles.cardTitle}>Next session</Text>
          <Text style={styles.cardDetail}>{nextSession.name}</Text>
          <Pressable
            testID="dashboard-start-session"
            style={styles.button}
            onPress={() => onStartSession?.(nextSession.id)}
          >
            <Text style={styles.buttonText}>Start session</Text>
          </Pressable>
        </View>
      ) : null}

      {targets ? (
        <View testID="dashboard-nutrition" style={styles.card}>
          <Text style={styles.cardTitle}>Today&apos;s nutrition</Text>
          <Text style={styles.cardDetail}>
            Calories: {Math.round(totals.calories)} / {targets.dailyCalories}
          </Text>
          <Text style={styles.cardDetail}>
            Protein: {Math.round(totals.proteinG)}g / {targets.proteinG}g
          </Text>
        </View>
      ) : null}

      {mostRecentPr ? (
        <View testID="dashboard-recent-pr" style={styles.card}>
          <Text style={styles.cardTitle}>Recent achievement</Text>
          <Text style={styles.cardDetail}>
            {mostRecentPr.exerciseName}: {mostRecentPr.repCount}-rep PR at {formatWeight(mostRecentPr.weightKg, unitPreference)}
          </Text>
        </View>
      ) : null}

      <View style={styles.quickActions}>
        <Pressable testID="dashboard-quick-log-food" style={styles.quickButton} onPress={onLogFood}>
          <Text style={styles.quickButtonText}>Log food</Text>
        </Pressable>
        <Pressable testID="dashboard-quick-log-weight" style={styles.quickButton} onPress={onLogWeight}>
          <Text style={styles.quickButtonText}>Log weight</Text>
        </Pressable>
        <Pressable testID="dashboard-quick-start-freeform" style={styles.quickButton} onPress={onStartFreeform}>
          <Text style={styles.quickButtonText}>Freeform workout</Text>
        </Pressable>
        <Pressable testID="dashboard-quick-view-history" style={styles.quickButton} onPress={onViewHistory}>
          <Text style={styles.quickButtonText}>History</Text>
        </Pressable>
        <Pressable testID="dashboard-quick-browse-muscles" style={styles.quickButton} onPress={onBrowseMuscles}>
          <Text style={styles.quickButtonText}>Browse muscles</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
  card: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#444', marginBottom: 4 },
  cardDetail: { fontSize: 14, marginTop: 2 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  quickButton: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  quickButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
});
