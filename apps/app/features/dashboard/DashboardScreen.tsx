import {
  getCurrentNutritionTargets,
  getCurrentPlan,
  getFoodLogEntriesForDate,
  getPendingProgressionSuggestions,
  getPersonalRecordsForUser,
  getProfile,
  getWeightEntries,
  getWorkoutSessionHistory,
  updateProgressionSuggestionStatus,
  type GymSupabaseClient,
  type PendingProgressionSuggestion,
  type PersistedNutritionTargets,
  type PersistedPlan,
  type PersistedWorkoutSession,
  type PersonalRecordWithExerciseName,
} from 'api-client';
import {
  computeDailyTotals,
  countCompletedSince,
  determineNextPlannedSessionAfter,
  suggestMissedSessionOptions,
  WEEKDAY_SHORT,
  formatWeight,
  localDateString,
  startOfLocalWeek,
  weightChange,
  type UnitPreference,
  type WeightChange,
} from 'core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../../components/EmptyState';
import MissedSessionCard from '../plan/MissedSessionCard';
import ProgressionSuggestionCard from '../plan/ProgressionSuggestionCard';
import { loadWeekSchedule, type WeekScheduleData } from '../plan/weekScheduleData';

export interface DashboardScreenProps {
  client: GymSupabaseClient;
  userId: string;
  /** Change this (e.g. on screen focus) to reload everything; the screen itself has no navigation dependency. */
  refreshToken?: number;
  onStartSession?: (plannedSessionId: string, mergedPlannedSessionId?: string) => void;
  onStartFreeform?: () => void;
  onLogFood?: () => void;
  onLogWeight?: () => void;
  onViewWeight?: () => void;
  onViewHistory?: () => void;
  onBrowseMuscles?: () => void;
  onCreatePlan?: () => void;
  onSetTargets?: () => void;
  /** Opens the Plan tab (missed-session options). */
  onOpenPlan?: () => void;
  /** For tests: the current time. */
  now?: Date;
}

type SuggestionStatus = 'pending' | 'accepted' | 'declined' | 'overridden';

interface DashboardData {
  plan: PersistedPlan | null;
  sessions: PersistedWorkoutSession[];
  targets: PersistedNutritionTargets | null;
  totals: { calories: number; proteinG: number; carbsG: number; fatG: number };
  mostRecentPr: PersonalRecordWithExerciseName | null;
  weight: WeightChange | null;
  suggestions: (PendingProgressionSuggestion & { displayStatus: SuggestionStatus })[];
  unitPreference: UnitPreference;
  /** FR-2.5: this week on the user's chosen days; null until they pick weekdays. */
  week: WeekScheduleData | null;
}

const WEIGHT_CHANGE_DAYS = 7;
const MAX_SUGGESTION_CARDS = 3;

/** A secondary card's query: any failure (returned or thrown) just hides that card. */
async function orNull<T>(promise: Promise<{ data: T | null; error: string | null }>): Promise<T | null> {
  try {
    const result = await promise;
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}

async function loadDashboard(client: GymSupabaseClient, userId: string, now: Date): Promise<DashboardData> {
  const [planRes, historyRes, targetsRes, foodRes, profileRes, records, weightEntries, suggestions] = await Promise.all([
    getCurrentPlan(client, userId),
    getWorkoutSessionHistory(client, userId),
    getCurrentNutritionTargets(client, userId),
    getFoodLogEntriesForDate(client, userId, localDateString(now)),
    getProfile(client, userId),
    orNull(getPersonalRecordsForUser(client, userId)),
    orNull(getWeightEntries(client, userId)),
    orNull(getPendingProgressionSuggestions(client, userId)),
  ]);

  const coreError = planRes.error ?? historyRes.error ?? targetsRes.error ?? foodRes.error;
  if (coreError) throw new Error(coreError);

  const mostRecentPr =
    records && records.length > 0
      ? records.reduce((a, b) => (Date.parse(a.achievedAt) > Date.parse(b.achievedAt) ? a : b))
      : null;

  let week: WeekScheduleData | null = null;
  if (planRes.data && profileRes.data) {
    try {
      week = await loadWeekSchedule({
        client,
        userId,
        plan: planRes.data,
        trainingWeekdays: profileRes.data.training_weekdays,
        trainingDaysPerWeek: profileRes.data.training_days_per_week,
        now,
      });
    } catch {
      week = null;
    }
  }

  return {
    plan: planRes.data ?? null,
    sessions: (historyRes.data ?? []).map((entry) => entry.session),
    targets: targetsRes.data ?? null,
    totals: computeDailyTotals(foodRes.data ?? []),
    mostRecentPr,
    weight: weightEntries ? weightChange(weightEntries, WEIGHT_CHANGE_DAYS) : null,
    suggestions: (suggestions ?? []).map((s) => ({ ...s, displayStatus: 'pending' as const })),
    unitPreference: profileRes.data?.unit_preference ?? 'metric',
    week,
  };
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatSignedWeight(deltaKg: number, unitPreference: UnitPreference): string {
  if (Math.abs(deltaKg) < 0.05) return `No change in ${WEIGHT_CHANGE_DAYS} days`;
  const sign = deltaKg > 0 ? '+' : '−';
  return `${sign}${formatWeight(Math.abs(deltaKg), unitPreference)} in ${WEIGHT_CHANGE_DAYS} days`;
}

function MacroRow({ label, unit, eaten, target, testID }: { label: string; unit: string; eaten: number; target: number; testID: string }) {
  const ratio = target > 0 ? eaten / target : 0;
  const over = ratio > 1;
  return (
    <View testID={testID} style={styles.macroRow}>
      <View style={styles.macroLabels}>
        <Text style={styles.macroLabel}>{label}</Text>
        <Text testID={`${testID}-value`} style={[styles.macroValue, over && styles.overText]}>
          {`${Math.round(eaten)}${unit} / ${target}${unit}`}
        </Text>
      </View>
      <View
        style={styles.barTrack}
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: target, now: Math.round(eaten) }}
      >
        <View testID={`${testID}-bar`} style={[styles.barFill, over && styles.barFillOver, { width: `${Math.min(ratio, 1) * 100}%` }]} />
      </View>
    </View>
  );
}

/**
 * UX-3/UX-6/UX-9: the home dashboard. At a glance: the next planned
 * session, this week's completed sessions, today's nutrition against the
 * current targets, body weight, pending progression suggestions to review,
 * the most recent PR, and quick-log actions. Empty states guide a user
 * with no plan or targets to set them up.
 *
 * Reloads whenever `refreshToken` changes (the navigator bumps it on
 * focus) and on pull-to-refresh. A failure in plan/targets/history/food
 * shows a retry card; a failure in the secondary cards only hides them.
 */
export default function DashboardScreen({
  client,
  userId,
  refreshToken,
  onStartSession,
  onStartFreeform,
  onLogFood,
  onLogWeight,
  onViewWeight,
  onViewHistory,
  onBrowseMuscles,
  onCreatePlan,
  onSetTargets,
  onOpenPlan,
  now: nowProp,
}: DashboardScreenProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  // Drops results from a load that a newer load (refresh/focus) has superseded.
  const latestLoad = useRef(0);

  const load = useCallback(async () => {
    const loadId = ++latestLoad.current;
    try {
      const next = await loadDashboard(client, userId, nowProp ?? new Date());
      if (loadId !== latestLoad.current) return;
      setData(next);
      setStatus('ready');
    } catch {
      if (loadId !== latestLoad.current) return;
      setStatus('error');
    } finally {
      if (loadId === latestLoad.current) setRefreshing(false);
    }
  }, [client, userId, nowProp]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  function handleRetry() {
    setStatus('loading');
    load();
  }

  function handlePullToRefresh() {
    setRefreshing(true);
    load();
  }

  async function resolveSuggestion(
    suggestionId: string,
    update: { status: 'accepted' | 'declined' | 'overridden'; overriddenWeightKg?: number | null; overriddenReps?: number | null },
  ) {
    const result = await updateProgressionSuggestionStatus(client, userId, suggestionId, update);
    if (result.error) return;
    setData((prev) =>
      prev
        ? {
            ...prev,
            suggestions: prev.suggestions.map((s) => (s.id === suggestionId ? { ...s, displayStatus: update.status } : s)),
          }
        : prev,
    );
  }

  if (status === 'loading' && !data) {
    return (
      <View style={styles.container}>
        <Text testID="dashboard-loading">Loading...</Text>
      </View>
    );
  }

  if (status === 'error' && !data) {
    return (
      <View style={styles.container}>
        <View testID="dashboard-error" style={styles.card} accessibilityRole="alert">
          <Text style={styles.cardTitle}>Couldn&apos;t load your dashboard</Text>
          <Text style={styles.cardDetail}>Check your connection and try again.</Text>
          <Pressable testID="dashboard-retry" style={styles.button} onPress={handleRetry} accessibilityRole="button">
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!data) return null;

  const { plan, sessions, targets, totals, mostRecentPr, weight, suggestions, unitPreference, week } = data;
  const now = nowProp ?? new Date();

  // FR-2.5: with chosen weekdays, "next" comes from this week's schedule
  // (today's session, else the next one this week); without, it is the
  // session after the last completed one.
  const scheduled = week?.schedule ?? null;
  const nextEntry = scheduled?.next ?? null;
  const lastCompletedPlanned = sessions.find((s) => s.status === 'completed' && s.plannedSessionId);
  const nextSession = !plan
    ? null
    : scheduled
      ? (plan.sessions.find((s) => s.id === nextEntry?.session.id) ?? null)
      : determineNextPlannedSessionAfter(plan.sessions, lastCompletedPlanned?.plannedSessionId ?? null);
  const mergedIntoNext = nextEntry?.mergedFrom[0] ?? null;
  const nextDayNumber =
    plan && nextSession ? [...plan.sessions].sort((a, b) => a.dayOrder - b.dayOrder).indexOf(nextSession) + 1 : 0;
  const nextDetail = (() => {
    if (!plan || !nextSession) return '';
    const count = `${nextSession.exercises.length} ${nextSession.exercises.length === 1 ? 'exercise' : 'exercises'}`;
    if (!nextEntry) return `Day ${nextDayNumber} of ${plan.sessions.length} · ${count}`;
    const when =
      nextEntry.status === 'today'
        ? 'Today'
        : new Date(`${nextEntry.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
    return `${when} · ${count}${mergedIntoNext ? ` · plus ${mergedIntoNext.name}` : ''}`;
  })();

  const weekEntries = scheduled ? scheduled.days.flatMap((d) => d.entries) : [];
  // One session per chosen weekday (merged sessions still count; they're done with their target).
  const weekTotal = week ? Math.min(week.weekdays.length, plan?.sessions.length ?? 0) : (plan?.sessions.length ?? 0);
  const completedThisWeek = scheduled
    ? weekEntries.filter((e) => e.status === 'done').length
    : countCompletedSince(
        sessions.filter((s) => s.status === 'completed').map((s) => s.completedAt),
        startOfLocalWeek(now),
      );
  const firstMissed = scheduled?.missed[0] ?? null;
  const shownSuggestions = suggestions.slice(0, MAX_SUGGESTION_CARDS);
  const hiddenSuggestionCount = suggestions.length - shownSuggestions.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="dashboard-screen"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handlePullToRefresh} />}
    >
      <Text testID="dashboard-greeting" style={styles.title}>
        {greeting(now)}
      </Text>
      <Text style={styles.subtitle}>
        {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      </Text>

      {status === 'error' ? (
        <View testID="dashboard-error" style={styles.inlineError} accessibilityRole="alert">
          <Text style={styles.inlineErrorText}>Couldn&apos;t refresh. Showing your last loaded data.</Text>
          <Pressable testID="dashboard-retry" onPress={handleRetry} accessibilityRole="button">
            <Text style={styles.inlineErrorAction}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {plan && nextSession ? (
        <View testID="dashboard-next-session" style={[styles.card, styles.primaryCard]}>
          <Text style={[styles.cardTitle, styles.primaryCardTitle]}>Next session</Text>
          <Text testID="dashboard-next-session-name" style={styles.primaryCardHeadline}>
            {nextSession.name}
          </Text>
          <Text testID="dashboard-next-session-detail" style={styles.primaryCardDetail}>
            {nextDetail}
          </Text>
          <Pressable
            testID="dashboard-start-session"
            style={[styles.button, styles.primaryButton]}
            onPress={() => (mergedIntoNext ? onStartSession?.(nextSession.id, mergedIntoNext.id) : onStartSession?.(nextSession.id))}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, styles.primaryButtonText]}>Start session</Text>
          </Pressable>
        </View>
      ) : plan && scheduled ? (
        <View testID="dashboard-week-complete" style={[styles.card, styles.primaryCard]}>
          <Text style={[styles.cardTitle, styles.primaryCardTitle]}>Next session</Text>
          <Text style={styles.primaryCardHeadline}>
            {firstMissed ? 'Nothing left on your schedule this week' : 'Week complete'}
          </Text>
          <Text style={styles.primaryCardDetail}>
            {firstMissed ? 'You can still catch up on a missed session below.' : 'Rest up. Your next week starts on Monday.'}
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <EmptyState
            testID="dashboard-empty-plan"
            title="No workout plan yet"
            message="Create a plan to see your next session here."
            actionLabel="Create your plan"
            onAction={onCreatePlan}
          />
        </View>
      )}

      {firstMissed && scheduled && week ? (
        <MissedSessionCard
          variant="compact"
          missed={firstMissed}
          options={suggestMissedSessionOptions({ schedule: scheduled, missed: firstMissed, today: week.today })}
          onSeeOptions={onOpenPlan}
        />
      ) : null}

      {plan && plan.sessions.length > 0 ? (
        <View testID="dashboard-week" style={styles.card}>
          <Text style={styles.cardTitle}>This week</Text>
          <Text testID="dashboard-week-count" style={styles.cardHeadline}>
            {`${completedThisWeek} of ${weekTotal} sessions`}
          </Text>
          {scheduled ? (
            // One dot per weekday: filled when done, outlined red when missed, faint on rest days.
            <View style={styles.weekDays}>
              {scheduled.days.map((day) => {
                const entry = day.entries[0];
                const dotStyle = !entry
                  ? styles.weekDayRest
                  : entry.status === 'done'
                    ? styles.weekDotDone
                    : entry.status === 'missed'
                      ? styles.weekDotMissed
                      : null;
                return (
                  <View key={day.date} style={styles.weekDayCol} testID={`dashboard-week-day-${day.date}`}>
                    <View style={[styles.weekDot, dotStyle, day.date === week?.today && styles.weekDotToday]} />
                    <Text style={styles.weekDayLabel}>{WEEKDAY_SHORT[day.weekday].charAt(0)}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.weekDots}>
              {plan.sessions.map((s, index) => (
                <View key={s.id} style={[styles.weekDot, index < completedThisWeek && styles.weekDotDone]} />
              ))}
            </View>
          )}
        </View>
      ) : null}

      {targets ? (
        <View testID="dashboard-nutrition" style={styles.card}>
          <Text style={styles.cardTitle}>Today&apos;s nutrition</Text>
          <Text testID="dashboard-calories-remaining" style={styles.cardHeadline}>
            {totals.calories <= targets.dailyCalories
              ? `${Math.round(targets.dailyCalories - totals.calories)} kcal left`
              : `${Math.round(totals.calories - targets.dailyCalories)} kcal over`}
          </Text>
          <MacroRow testID="dashboard-macro-calories" label="Calories" unit="" eaten={totals.calories} target={targets.dailyCalories} />
          <MacroRow testID="dashboard-macro-protein" label="Protein" unit="g" eaten={totals.proteinG} target={targets.proteinG} />
          <MacroRow testID="dashboard-macro-carbs" label="Carbs" unit="g" eaten={totals.carbsG} target={targets.carbsG} />
          <MacroRow testID="dashboard-macro-fat" label="Fat" unit="g" eaten={totals.fatG} target={targets.fatG} />
        </View>
      ) : (
        <View style={styles.card}>
          <EmptyState
            testID="dashboard-empty-targets"
            title="No nutrition targets yet"
            message="Set your daily targets to track calories and macros here."
            actionLabel="Set nutrition targets"
            onAction={onSetTargets}
          />
        </View>
      )}

      {weight ? (
        <Pressable
          testID="dashboard-weight"
          style={styles.card}
          onPress={onViewWeight}
          accessibilityRole="button"
          accessibilityLabel="Body weight, view trend"
        >
          <Text style={styles.cardTitle}>Body weight</Text>
          <Text testID="dashboard-weight-latest" style={styles.cardHeadline}>
            {formatWeight(weight.latestKg, unitPreference)}
          </Text>
          <Text testID="dashboard-weight-change" style={styles.cardDetail}>
            {weight.deltaKg === null ? 'Log again over the week to see your trend' : formatSignedWeight(weight.deltaKg, unitPreference)}
          </Text>
        </Pressable>
      ) : (
        <Pressable testID="dashboard-weight-empty" style={styles.card} onPress={onLogWeight} accessibilityRole="button">
          <Text style={styles.cardTitle}>Body weight</Text>
          <Text style={styles.cardDetail}>Log your first weigh-in to start a trend.</Text>
        </Pressable>
      )}

      {shownSuggestions.length > 0 ? (
        <View testID="dashboard-suggestions" style={styles.section}>
          <Text style={styles.sectionTitle}>Progression to review</Text>
          {shownSuggestions.map((s) => (
            <ProgressionSuggestionCard
              key={s.id}
              exerciseId={s.exerciseId}
              exerciseName={s.exerciseName}
              action={s.action}
              suggestedWeightKg={s.suggestedWeightKg}
              suggestedReps={s.suggestedReps}
              rationale={s.rationale}
              status={s.displayStatus}
              onAccept={() => resolveSuggestion(s.id, { status: 'accepted' })}
              onDecline={() => resolveSuggestion(s.id, { status: 'declined' })}
              onOverride={(overriddenWeightKg, overriddenReps) =>
                resolveSuggestion(s.id, { status: 'overridden', overriddenWeightKg, overriddenReps })
              }
            />
          ))}
          {hiddenSuggestionCount > 0 ? (
            <Text testID="dashboard-suggestions-more" style={styles.cardDetail}>
              {`+${hiddenSuggestionCount} more after these`}
            </Text>
          ) : null}
        </View>
      ) : null}

      {mostRecentPr ? (
        <View testID="dashboard-recent-pr" style={styles.card}>
          <Text style={styles.cardTitle}>Recent achievement</Text>
          <Text testID="dashboard-recent-pr-detail" style={styles.cardDetail}>
            {`${mostRecentPr.exerciseName}: ${mostRecentPr.repCount}-rep PR at ${formatWeight(mostRecentPr.weightKg, unitPreference)}`}
          </Text>
          <Text style={styles.cardMeta}>
            {new Date(mostRecentPr.achievedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Quick actions</Text>
      <View style={styles.quickActions}>
        <Pressable testID="dashboard-quick-log-food" style={styles.quickButton} onPress={onLogFood} accessibilityRole="button">
          <Text style={styles.quickButtonText}>Log food</Text>
        </Pressable>
        <Pressable testID="dashboard-quick-log-weight" style={styles.quickButton} onPress={onLogWeight} accessibilityRole="button">
          <Text style={styles.quickButtonText}>Log weight</Text>
        </Pressable>
        <Pressable testID="dashboard-quick-start-freeform" style={styles.quickButton} onPress={onStartFreeform} accessibilityRole="button">
          <Text style={styles.quickButtonText}>Freeform workout</Text>
        </Pressable>
        <Pressable testID="dashboard-quick-view-history" style={styles.quickButton} onPress={onViewHistory} accessibilityRole="button">
          <Text style={styles.quickButtonText}>History</Text>
        </Pressable>
        <Pressable testID="dashboard-quick-browse-muscles" style={styles.quickButton} onPress={onBrowseMuscles} accessibilityRole="button">
          <Text style={styles.quickButtonText}>Browse muscles</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  content: { paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 2, marginBottom: 16 },
  card: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  cardHeadline: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 6 },
  cardDetail: { fontSize: 14, color: '#333', marginTop: 2 },
  cardMeta: { fontSize: 12, color: '#777', marginTop: 4 },
  primaryCard: { backgroundColor: '#111' },
  primaryCardTitle: { color: '#bbb' },
  primaryCardHeadline: { fontSize: 20, fontWeight: '700', color: '#fff' },
  primaryCardDetail: { fontSize: 13, color: '#ccc', marginTop: 4 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 12, minHeight: 44, justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  primaryButton: { backgroundColor: '#fff' },
  primaryButtonText: { color: '#111' },
  inlineError: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fdecea', borderRadius: 8, padding: 10, marginBottom: 12 },
  inlineErrorText: { color: '#b00020', fontSize: 13, flex: 1, marginRight: 8 },
  inlineErrorAction: { color: '#b00020', fontWeight: '700', fontSize: 13 },
  weekDots: { flexDirection: 'row', gap: 6, marginTop: 4 },
  weekDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#ddd' },
  weekDotDone: { backgroundColor: '#2e7d32' },
  weekDotMissed: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#b00020' },
  weekDotToday: { borderWidth: 2, borderColor: '#111' },
  weekDays: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  weekDayCol: { alignItems: 'center', gap: 4 },
  weekDayRest: { backgroundColor: '#f0f0f0' },
  weekDayLabel: { fontSize: 11, color: '#777' },
  macroRow: { marginTop: 8 },
  macroLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  macroLabel: { fontSize: 13, color: '#333', fontWeight: '600' },
  macroValue: { fontSize: 13, color: '#333' },
  overText: { color: '#b45309' },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: '#e2e2e2', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: '#111' },
  barFillOver: { backgroundColor: '#b45309' },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 4, marginBottom: 8 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  quickButton: {
    width: '48.5%',
    minHeight: 44,
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
