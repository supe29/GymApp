import {
  buildRegenerationPreview,
  createWorkoutPlan,
  generateInitialPlan,
  getCurrentPlan,
  getMuscleKeysForExercises,
  getProfile,
  listMuscleGroups,
  updateTrainingWeekdays,
  type GymSupabaseClient,
  type PersistedPlan,
  type PersistedSession,
  type RegenerationPreview,
} from 'api-client';
import {
  WEEKDAY_SHORT,
  defaultWeekdays,
  suggestMissedSessionOptions,
  validWeekdays,
  type EntryStatus,
  type MissedOption,
  type ScheduleEntry,
  type Weekday,
} from 'core';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import ExerciseDemoPanel, { DemoModelCredit } from '../../components/ExerciseDemoPanel';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { useExerciseMuscles } from '../exercise-demo/useExerciseMuscles';
import MissedSessionCard from './MissedSessionCard';
import RegeneratePlanPrompt from './RegeneratePlanPrompt';
import WeekdayPicker from './WeekdayPicker';
import { applyMissedOption, loadWeekSchedule, undoChoice, type WeekScheduleData } from './weekScheduleData';

export interface WorkoutPlanScreenProps {
  client?: GymSupabaseClient;
  userId: string;
  onPlanRegenerated?: () => void;
  /** Starts a planned session (and a missed one merged into it, if any). */
  onStartSession?: (plannedSessionId: string, mergedPlannedSessionId?: string) => void;
  /** For tests: the current time. */
  now?: Date;
}

async function safe<T>(call: () => Promise<{ data: T | null; error: string | null }>): Promise<T | null> {
  try {
    const result = await call();
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}

const STATUS_LABEL: Record<EntryStatus, string> = {
  done: 'Done ✓',
  today: 'Today',
  upcoming: '',
  missed: 'Missed',
  skipped: 'Skipped',
  merged: 'Merged',
};

function dayLabel(date: string): { weekday: string; day: number; month: string } {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(y, m - 1, d);
  const weekday = (((js.getDay() + 6) % 7) + 1) as Weekday;
  return { weekday: WEEKDAY_SHORT[weekday], day: d, month: js.toLocaleDateString(undefined, { month: 'short' }) };
}

/**
 * FR-2.1–FR-2.6/AC-1/AC-2/AC-16/AC-17/NFR-7: the user's workout plan as a
 * week on their chosen training days (FR-2.5), with missed sessions
 * flagged and rule-based options to fix them (FR-2.6; resolves OQ-5, see
 * docs/decisions/OQ-5-session-rescheduling.md). Until weekdays are
 * picked, the plan shows as its day-ordered list with a day picker.
 * Regeneration previews a diff before committing (FR-2.4), each exercise
 * keeps its "why" disclosure (NFR-7) and movement demo (one open at a
 * time; each figure is a GL canvas).
 */
export default function WorkoutPlanScreen({
  client = getSupabaseClient(),
  userId,
  onPlanRegenerated,
  onStartSession,
  now,
}: WorkoutPlanScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PersistedPlan | null>(null);
  const [preview, setPreview] = useState<RegenerationPreview | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<Set<string>>(new Set());
  // Keyed by prescribed-exercise row id: the same exercise can appear in several sessions.
  const [openDemoRowId, setOpenDemoRowId] = useState<string | null>(null);
  const exerciseMuscles = useExerciseMuscles(client);

  const [profileDays, setProfileDays] = useState<{ count: number; weekdays: number[] | null } | null>(null);
  const [editingDays, setEditingDays] = useState(false);
  const [savingDays, setSavingDays] = useState(false);
  const [daysError, setDaysError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [week, setWeek] = useState<WeekScheduleData | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [muscleInfo, setMuscleInfo] = useState<{ byExercise: Record<string, string[]>; names: Record<string, string> }>({
    byExercise: {},
    names: {},
  });

  useEffect(() => {
    async function load() {
      const [planResult, profile] = await Promise.all([getCurrentPlan(client, userId), safe(() => getProfile(client, userId))]);
      if (planResult.error) {
        setError(planResult.error);
      } else {
        setCurrentPlan(planResult.data);
      }
      if (profile) {
        setProfileDays({ count: profile.training_days_per_week, weekdays: profile.training_weekdays ?? null });
      }
      setLoaded(true);
    }
    load();
  }, [client, userId]);

  // Muscles per exercise, for the merge option's "both work your …" reason.
  useEffect(() => {
    if (!currentPlan) return;
    const ids = currentPlan.sessions.flatMap((s) => s.exercises.map((ex) => ex.exerciseId));
    Promise.all([safe(() => getMuscleKeysForExercises(client, ids)), safe(() => listMuscleGroups(client))]).then(([keys, groups]) => {
      setMuscleInfo({
        byExercise: Object.fromEntries([...(keys?.entries() ?? [])].map(([id, k]) => [id, k.primary])),
        names: Object.fromEntries((groups ?? []).map((g) => [g.key, g.display_name])),
      });
    });
  }, [client, currentPlan]);

  const refreshWeek = useCallback(async () => {
    if (!currentPlan || !profileDays) {
      setWeek(null);
      return;
    }
    const data = await loadWeekSchedule({
      client,
      userId,
      plan: currentPlan,
      trainingWeekdays: profileDays.weekdays,
      trainingDaysPerWeek: profileDays.count,
      now,
      weekOffset,
    });
    setWeek(data);
  }, [client, userId, currentPlan, profileDays, now, weekOffset]);

  useEffect(() => {
    refreshWeek();
  }, [refreshWeek]);

  async function handleGenerateInitial() {
    setError(null);
    setGenerating(true);
    const result = await generateInitialPlan(client, userId);
    setGenerating(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCurrentPlan(result.data);
    onPlanRegenerated?.();
  }

  async function handleRequestRegenerate() {
    setError(null);
    setPreviewLoading(true);
    const result = await buildRegenerationPreview(client, userId);
    setPreviewLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to build a regeneration preview.');
      return;
    }
    setPreview(result.data);
  }

  async function handleAcceptRegenerate() {
    if (!preview) return;
    setAccepting(true);
    const result = await createWorkoutPlan(client, userId, preview.candidatePlan);
    setAccepting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCurrentPlan(result.data);
    setPreview(null);
    onPlanRegenerated?.();
  }

  function handleDeclineRegenerate() {
    // FR-2.4/AC-3-equivalent for the on-demand path: declining makes no
    // API call at all — the previewed candidate is simply discarded.
    setPreview(null);
  }

  async function handleSaveDays(weekdays: Weekday[]) {
    setSavingDays(true);
    setDaysError(null);
    const result = await updateTrainingWeekdays(client, userId, weekdays);
    setSavingDays(false);
    if (result.error || !result.data) {
      setDaysError(result.error ?? 'Could not save your days.');
      return;
    }
    setProfileDays({ count: result.data.training_days_per_week, weekdays: result.data.training_weekdays ?? weekdays });
    setEditingDays(false);
  }

  async function handleChoose(missed: ScheduleEntry, option: MissedOption) {
    if (!week || !currentPlan) return;
    setChoosing(true);
    setError(null);
    const failure = await applyMissedOption({ client, userId, planId: currentPlan.id, weekStart: week.weekStart, missed, option });
    setChoosing(false);
    if (failure) setError(failure);
    await refreshWeek();
  }

  async function handleUndo(entry: ScheduleEntry) {
    if (!week) return;
    setChoosing(true);
    const failure = await undoChoice({ client, userId, data: week, entry });
    setChoosing(false);
    if (failure) setError(failure);
    await refreshWeek();
  }

  function toggleWhy(exerciseId: string) {
    setExpandedExerciseIds((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) {
        next.delete(exerciseId);
      } else {
        next.add(exerciseId);
      }
      return next;
    });
  }

  function toggleDemo(rowId: string, exerciseId: string) {
    if (openDemoRowId === rowId) {
      setOpenDemoRowId(null);
      return;
    }
    setOpenDemoRowId(rowId);
    exerciseMuscles.request(exerciseId);
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="plan-loading">Loading...</Text>
      </View>
    );
  }

  if (preview) {
    return (
      <RegeneratePlanPrompt
        diffSummary={preview.diffSummary}
        onAccept={handleAcceptRegenerate}
        onDecline={handleDeclineRegenerate}
        accepting={accepting}
      />
    );
  }

  if (!currentPlan) {
    return (
      <View style={styles.container}>
        <Text testID="plan-empty-state" style={styles.title}>
          No workout plan yet
        </Text>
        {error ? (
          <Text testID="plan-error" style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Pressable
          testID="plan-generate-button"
          style={styles.button}
          disabled={generating}
          onPress={handleGenerateInitial}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{generating ? 'Generating…' : 'Generate my plan'}</Text>
        </Pressable>
      </View>
    );
  }

  const sessionById = new Map(currentPlan.sessions.map((s) => [s.id, s]));
  const dayCount = profileDays?.count ?? currentPlan.sessions.length;
  const chosenWeekdays = validWeekdays(profileDays?.weekdays, dayCount);
  const showPicker = profileDays !== null && (editingDays || !chosenWeekdays);

  function renderExercises(session: PersistedSession) {
    return session.exercises.map((ex) => (
      <View key={ex.id} testID={`plan-exercise-${ex.exerciseId}`} style={styles.exerciseRow}>
        <Text style={styles.exerciseName}>
          {ex.exerciseName}: {ex.targetSets}×{ex.targetRepsMin}
          {ex.targetRepsMax && ex.targetRepsMax !== ex.targetRepsMin ? `-${ex.targetRepsMax}` : ''}
        </Text>
        <View style={styles.rowLinks}>
          <Pressable
            testID={`plan-exercise-why-toggle-${ex.exerciseId}`}
            onPress={() => toggleWhy(ex.exerciseId)}
            accessibilityRole="button"
            accessibilityLabel={`Why was ${ex.exerciseName} prescribed?`}
            accessibilityState={{ expanded: expandedExerciseIds.has(ex.exerciseId) }}
          >
            <Text style={styles.whyLink}>Why?</Text>
          </Pressable>
          <Pressable
            testID={`plan-exercise-demo-toggle-${ex.exerciseId}`}
            onPress={() => toggleDemo(ex.id, ex.exerciseId)}
            accessibilityRole="button"
            accessibilityLabel={`${openDemoRowId === ex.id ? 'Hide' : 'Show'} how to do ${ex.exerciseName}`}
            accessibilityState={{ expanded: openDemoRowId === ex.id }}
          >
            <Text style={styles.whyLink}>{openDemoRowId === ex.id ? 'Hide demo' : 'Show demo'}</Text>
          </Pressable>
        </View>
        {expandedExerciseIds.has(ex.exerciseId) ? (
          <Text testID={`plan-exercise-why-${ex.exerciseId}`} style={styles.whyText}>
            {ex.intensityNote}
          </Text>
        ) : null}
        {openDemoRowId === ex.id ? (
          <ExerciseDemoPanel
            exerciseName={ex.exerciseName}
            muscles={exerciseMuscles.musclesFor(ex.exerciseId)}
            testID={`plan-exercise-demo-${ex.exerciseId}`}
          />
        ) : null}
      </View>
    ));
  }

  function renderEntry(entry: ScheduleEntry) {
    const session = sessionById.get(entry.session.id);
    if (!session) return null;
    const canStart = weekOffset === 0 && (entry.status === 'today' || (entry.status === 'upcoming' && entry === week?.schedule.next));
    const hasChoice = entry.status === 'skipped' || entry.movedFrom !== null;
    const merged = entry.mergedFrom.map((s) => sessionById.get(s.id)).filter((s): s is PersistedSession => !!s);
    return (
      <View key={entry.session.id} testID={`plan-session-${session.dayOrder}`} style={styles.session}>
        <View style={styles.sessionHeader}>
          <Text style={[styles.sessionTitle, entry.status === 'skipped' && styles.struck]}>{session.name}</Text>
          {STATUS_LABEL[entry.status] ? (
            <Text testID={`plan-session-${session.dayOrder}-status`} style={[styles.badge, styles[`badge_${entry.status}`]]}>
              {STATUS_LABEL[entry.status]}
            </Text>
          ) : null}
        </View>
        {entry.movedFrom ? (
          <Text style={styles.note}>{`Moved from ${dayLabel(entry.movedFrom).weekday}`}</Text>
        ) : null}
        {merged.length > 0 ? (
          <Text testID={`plan-session-${session.dayOrder}-merged`} style={styles.note}>
            {`Includes ${merged.map((s) => s.name).join(', ')} (missed). Do them together.`}
          </Text>
        ) : null}
        {entry.status !== 'skipped' ? renderExercises(session) : null}
        <View style={styles.entryActions}>
          {canStart && onStartSession ? (
            <Pressable
              testID={`plan-session-${session.dayOrder}-start`}
              style={styles.startButton}
              onPress={() => onStartSession(session.id, merged[0]?.id)}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{entry.status === 'today' ? 'Start today’s session' : 'Start next session'}</Text>
            </Pressable>
          ) : null}
          {hasChoice || merged.length > 0 ? (
            <Pressable
              testID={`plan-session-${session.dayOrder}-undo`}
              disabled={choosing}
              onPress={() => handleUndoFor(entry, merged)}
              accessibilityRole="button"
            >
              <Text style={styles.link}>Undo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  function handleUndoFor(entry: ScheduleEntry, merged: PersistedSession[]) {
    // On a session that others were merged into, Undo removes the merge
    // choice, which belongs to the merged (missed) session.
    if (merged.length > 0) {
      const source = merged[0];
      void handleUndo({
        ...entry,
        session: { id: source.id, dayOrder: source.dayOrder, name: source.name, exerciseIds: [] },
        movedFrom: null,
      });
      return;
    }
    void handleUndo(entry);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="plan-screen">
      <Text style={styles.title}>{currentPlan.splitType.replace('_', ' ')}</Text>
      <Text testID="plan-version-badge" style={styles.versionBadge}>
        v{currentPlan.planVersion}
      </Text>

      {error ? (
        <Text testID="plan-error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {showPicker ? (
        <WeekdayPicker
          count={dayCount}
          initial={chosenWeekdays ?? defaultWeekdays(dayCount)}
          saving={savingDays}
          error={daysError}
          onSave={handleSaveDays}
          onCancel={chosenWeekdays ? () => setEditingDays(false) : undefined}
        />
      ) : null}

      {week && !editingDays ? (
        <>
          <View style={styles.weekHeader}>
            <View>
              <Text testID="plan-week-title" style={styles.weekTitle}>
                {weekOffset === 0 ? 'This week' : 'Next week'}
              </Text>
              <Text style={styles.weekRange}>
                {`${dayLabel(week.schedule.days[0].date).weekday} ${dayLabel(week.schedule.days[0].date).day} – ${
                  dayLabel(week.schedule.days[6].date).weekday
                } ${dayLabel(week.schedule.days[6].date).day} ${dayLabel(week.schedule.days[6].date).month}`}
              </Text>
            </View>
            <View style={styles.weekLinks}>
              <Pressable testID="plan-week-toggle" onPress={() => setWeekOffset((o) => (o === 0 ? 1 : 0))} accessibilityRole="button">
                <Text style={styles.link}>{weekOffset === 0 ? 'Next week →' : '← This week'}</Text>
              </Pressable>
              <Pressable testID="plan-edit-days" onPress={() => setEditingDays(true)} accessibilityRole="button">
                <Text style={styles.link}>Edit days</Text>
              </Pressable>
            </View>
          </View>

          {weekOffset === 0
            ? week.schedule.missed.map((missed) => (
                <MissedSessionCard
                  key={missed.session.id}
                  missed={missed}
                  busy={choosing}
                  options={suggestMissedSessionOptions({
                    schedule: week.schedule,
                    missed,
                    today: week.today,
                    primaryMusclesByExercise: muscleInfo.byExercise,
                    muscleNames: muscleInfo.names,
                  })}
                  onChoose={(option) => handleChoose(missed, option)}
                />
              ))
            : null}

          {week.schedule.days.map((day) => {
            const label = dayLabel(day.date);
            const isToday = day.date === week.today;
            return (
              <View key={day.date} testID={`plan-day-${day.date}`} style={[styles.day, isToday && styles.dayToday]}>
                <View style={styles.dayLabel}>
                  <Text style={[styles.dayWeekday, isToday && styles.dayTodayText]}>{label.weekday}</Text>
                  <Text style={[styles.dayNumber, isToday && styles.dayTodayText]}>{label.day}</Text>
                </View>
                <View style={styles.dayBody}>
                  {day.entries.length === 0 ? <Text style={styles.rest}>Rest day</Text> : day.entries.map(renderEntry)}
                </View>
              </View>
            );
          })}
        </>
      ) : !showPicker || !profileDays ? (
        currentPlan.sessions.map((session) => (
          <View key={session.id} testID={`plan-session-${session.dayOrder}`} style={styles.session}>
            <Text style={styles.sessionTitle}>{session.name}</Text>
            {renderExercises(session)}
          </View>
        ))
      ) : (
        currentPlan.sessions.map((session) => (
          <View key={session.id} testID={`plan-session-${session.dayOrder}`} style={styles.session}>
            <Text style={styles.sessionTitle}>{`Day ${session.dayOrder} · ${session.name}`}</Text>
            {renderExercises(session)}
          </View>
        ))
      )}

      <Pressable
        testID="plan-regenerate-button"
        style={styles.button}
        disabled={previewLoading}
        onPress={handleRequestRegenerate}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{previewLoading ? 'Checking…' : 'Regenerate plan'}</Text>
      </Pressable>
      {openDemoRowId ? <DemoModelCredit /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  content: { paddingBottom: 48 },
  rowLinks: { flexDirection: 'row', gap: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 4, textTransform: 'capitalize' },
  versionBadge: { fontSize: 13, color: '#666', marginBottom: 16 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  weekTitle: { fontSize: 18, fontWeight: '700' },
  weekRange: { fontSize: 13, color: '#666', marginTop: 2 },
  weekLinks: { alignItems: 'flex-end', gap: 6 },
  link: { fontSize: 13, fontWeight: '700', color: '#111', textDecorationLine: 'underline' },
  day: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e6e6e6', paddingVertical: 10 },
  dayToday: { backgroundColor: '#f3f7f3', borderRadius: 10, borderTopColor: 'transparent', paddingHorizontal: 6 },
  dayLabel: { width: 48, alignItems: 'center' },
  dayWeekday: { fontSize: 12, fontWeight: '700', color: '#666', textTransform: 'uppercase' },
  dayNumber: { fontSize: 18, fontWeight: '700', color: '#111' },
  dayTodayText: { color: '#2e7d32' },
  dayBody: { flex: 1 },
  rest: { fontSize: 14, color: '#999', paddingTop: 8 },
  session: { marginBottom: 12 },
  sessionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sessionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  struck: { textDecorationLine: 'line-through', color: '#999' },
  note: { fontSize: 12, color: '#666', marginBottom: 4 },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  badge_done: { backgroundColor: '#e3f1e4', color: '#2e7d32' },
  badge_today: { backgroundColor: '#111', color: '#fff' },
  badge_upcoming: {},
  badge_missed: { backgroundColor: '#fdecea', color: '#b00020' },
  badge_skipped: { backgroundColor: '#eee', color: '#666' },
  badge_merged: { backgroundColor: '#eee', color: '#666' },
  exerciseRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  exerciseName: { fontSize: 14 },
  whyLink: { fontSize: 12, color: '#555', marginTop: 2 },
  whyText: { fontSize: 12, color: '#666', marginTop: 4 },
  entryActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  startButton: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b00020', marginTop: 12 },
});
