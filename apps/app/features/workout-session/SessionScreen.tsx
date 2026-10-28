import {
  completeWorkoutSession,
  createProgressionSuggestion,
  getExercisesWithTags,
  getPlannedSessionById,
  getSetLogsForSession,
  getUserEquipmentIds,
  listEquipmentItems,
  startWorkoutSession,
  updateProgressionSuggestionStatus,
  type GymSupabaseClient,
} from 'api-client';
import { evaluateExercisePerformance, filterByEquipmentSubset, filterByMuscleGroup, type ExerciseWithTags, type ProgressionAction } from 'core';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSupabaseClient } from '../../lib/supabaseClient';
import ProgressionSuggestionCard from '../plan/ProgressionSuggestionCard';
import { createOfflineQueue, generateLocalId, type OfflineQueueHandle } from './offlineQueue';
import RestTimer from './RestTimer';
import SetLogger, { type LoggedSetDisplay } from './SetLogger';

export interface SessionScreenProps {
  client?: GymSupabaseClient;
  userId: string;
  plannedSessionId: string;
  onSessionCompleted?: () => void;
}

interface SessionSlot {
  /** Stable across substitution — the original planned_session_exercises row id. */
  id: string;
  exerciseId: string;
  exerciseName: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number | null;
  targetWeightKg: number | null;
  skipped: boolean;
  nextSetIndex: number;
  loggedSets: LoggedSetDisplay[];
  showSubstituteOptions: boolean;
}

interface SuggestionCardState {
  suggestionId: string;
  exerciseId: string;
  exerciseName: string;
  action: ProgressionAction;
  suggestedWeightKg: number | null;
  suggestedReps: number | null;
  rationale: string;
  status: 'pending' | 'accepted' | 'declined' | 'overridden';
}

/**
 * FR-5.2/FR-5.3/FR-5.4/UX-4/NFR-3: a plan-attached workout session,
 * pre-filled from Phase 5's plan data. Supports add/skip/substitute
 * mid-session (FR-5.3). Each logged set goes through the offline queue
 * (offlineQueue.ts) rather than directly to the backend, so a brief
 * connectivity drop never discards an already-entered set (NFR-3).
 *
 * FR-6.1/FR-6.2/FR-6.3 (Phase 8): on completion, re-fetches the session's
 * confirmed logs (via getSetLogsForSession, per logAggregation.ts's "read
 * exclusively through this module" mandate — not the in-memory,
 * possibly-still-syncing loggedSets) and evaluates each prescribed,
 * non-skipped, non-added exercise. Added/skipped slots and freeform
 * sessions have no planned_session_exercises row to feed a "next
 * occurrence" suggestion into, so they're never evaluated. Resulting
 * suggestions are shown for accept/decline/override before
 * onSessionCompleted fires.
 *
 * OQ-5 (missed/skipped session rescheduling) is out of scope here, same
 * citation style as profileValidation.ts's OQ-6 note: this screen has no
 * "today"/calendar concept — plannedSessionId is an explicit prop.
 */
export default function SessionScreen({
  client = getSupabaseClient(),
  userId,
  plannedSessionId,
  onSessionCompleted,
}: SessionScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workoutSessionId, setWorkoutSessionId] = useState<string | null>(null);
  const [slots, setSlots] = useState<SessionSlot[]>([]);
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseWithTags[]>([]);
  const [availableEquipmentKeys, setAvailableEquipmentKeys] = useState<string[]>([]);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [suggestionCards, setSuggestionCards] = useState<SuggestionCardState[]>([]);
  const queueRef = useRef<OfflineQueueHandle | null>(null);

  function updateLoggedSet(id: string, patch: Partial<LoggedSetDisplay>) {
    setSlots((prev) =>
      prev.map((slot) => ({
        ...slot,
        loggedSets: slot.loggedSets.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      })),
    );
  }

  useEffect(() => {
    queueRef.current = createOfflineQueue(client, userId, {
      onSynced: (id) => updateLoggedSet(id, { syncStatus: 'synced' }),
      onFailed: (id, attempts) => updateLoggedSet(id, { syncStatus: attempts >= 5 ? 'failed' : 'pending' }),
    });
    return () => queueRef.current?.teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, userId]);

  useEffect(() => {
    async function load() {
      const [sessionResult, plannedResult, equipmentIdsResult, equipmentItemsResult, exercisesResult] =
        await Promise.all([
          startWorkoutSession(client, userId, plannedSessionId),
          getPlannedSessionById(client, userId, plannedSessionId),
          getUserEquipmentIds(client, userId),
          listEquipmentItems(client),
          getExercisesWithTags(client),
        ]);

      if (sessionResult.error || !sessionResult.data) {
        setError(sessionResult.error ?? 'Failed to start workout session.');
        setLoaded(true);
        return;
      }
      setWorkoutSessionId(sessionResult.data.id);

      if (plannedResult.data) {
        setSlots(
          plannedResult.data.exercises.map((ex) => ({
            id: ex.id,
            exerciseId: ex.exerciseId,
            exerciseName: ex.exerciseName,
            targetSets: ex.targetSets,
            targetRepsMin: ex.targetRepsMin,
            targetRepsMax: ex.targetRepsMax,
            targetWeightKg: ex.targetWeightKg,
            skipped: false,
            nextSetIndex: 1,
            loggedSets: [],
            showSubstituteOptions: false,
          })),
        );
      }

      setExerciseLibrary(exercisesResult.data ?? []);
      const equipmentIds = new Set(equipmentIdsResult.data ?? []);
      const keys = (equipmentItemsResult.data ?? [])
        .filter((item) => equipmentIds.has(item.id))
        .map((item) => item.key);
      setAvailableEquipmentKeys(keys);
      setLoaded(true);
    }
    load();
  }, [client, userId, plannedSessionId]);

  function handleLogSet(slotId: string, input: { weightKg: number | null; reps: number | null; rpe: number | null }) {
    if (!workoutSessionId || !queueRef.current) return;
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;

    const setIndex = slot.nextSetIndex;
    // Generated up front so the optimistic UI entry and the queue entry
    // share the same id from the start — no placeholder-id rename, no
    // race against onSynced/onFailed firing before that rename happens.
    const id = generateLocalId();

    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              nextSetIndex: s.nextSetIndex + 1,
              loggedSets: [
                ...s.loggedSets,
                { id, setIndex, weightKg: input.weightKg, reps: input.reps, rpe: input.rpe, syncStatus: 'pending' },
              ],
            }
          : s,
      ),
    );

    queueRef.current.enqueue({
      id,
      workoutSessionId,
      exerciseId: slot.exerciseId,
      setIndex,
      weightKg: input.weightKg,
      reps: input.reps,
      rpe: input.rpe,
    });
  }

  function handleRetrySet(id: string) {
    queueRef.current?.retryNow(id);
  }

  function handleSkip(slotId: string) {
    setSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, skipped: !s.skipped } : s)));
  }

  function toggleSubstituteOptions(slotId: string) {
    setSlots((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, showSubstituteOptions: !s.showSubstituteOptions } : s)),
    );
  }

  function substituteOptionsFor(slot: SessionSlot): ExerciseWithTags[] {
    const current = exerciseLibrary.find((e) => e.id === slot.exerciseId);
    if (!current || current.primaryMuscleKeys.length === 0) return [];
    const sameMuscle = filterByMuscleGroup(exerciseLibrary, current.primaryMuscleKeys[0]);
    return filterByEquipmentSubset(sameMuscle, availableEquipmentKeys).filter((e) => e.id !== slot.exerciseId);
  }

  function handleSubstitute(slotId: string, replacement: ExerciseWithTags) {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              exerciseId: replacement.id,
              exerciseName: replacement.name,
              nextSetIndex: 1,
              loggedSets: [],
              showSubstituteOptions: false,
            }
          : s,
      ),
    );
  }

  function handleAddExercise(exercise: ExerciseWithTags) {
    setSlots((prev) => [
      ...prev,
      {
        id: `added-${exercise.id}`,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        targetSets: 3,
        targetRepsMin: 8,
        targetRepsMax: 12,
        targetWeightKg: null,
        skipped: false,
        nextSetIndex: 1,
        loggedSets: [],
        showSubstituteOptions: false,
      },
    ]);
    setShowAddExercise(false);
  }

  async function handleCompleteSession() {
    if (!workoutSessionId) return;
    setCompleting(true);
    const result = await completeWorkoutSession(client, userId, workoutSessionId);
    if (result.error) {
      setCompleting(false);
      setError(result.error);
      return;
    }

    // FR-6.1: evaluate each prescribed, non-skipped, non-added exercise
    // against its confirmed (synced) logs, and persist a suggestion for
    // the ones with something to evaluate.
    const logsRes = await getSetLogsForSession(client, userId, workoutSessionId);
    const confirmedLogs = logsRes.data ?? [];
    const evaluableSlots = slots.filter((slot) => !slot.skipped && !slot.id.startsWith('added-'));

    const cards: SuggestionCardState[] = [];
    for (const slot of evaluableSlots) {
      const evaluation = evaluateExercisePerformance(
        {
          exerciseId: slot.exerciseId,
          targetSets: slot.targetSets,
          targetRepsMin: slot.targetRepsMin,
          targetRepsMax: slot.targetRepsMax,
          targetWeightKg: slot.targetWeightKg,
        },
        confirmedLogs.filter((log) => log.exerciseId === slot.exerciseId),
      );
      if (!evaluation) continue;

      const createRes = await createProgressionSuggestion(client, userId, {
        exerciseId: slot.exerciseId,
        sourceWorkoutSessionId: workoutSessionId,
        action: evaluation.action,
        suggestedWeightKg: evaluation.suggestedWeightKg,
        suggestedReps: evaluation.suggestedReps,
        rationale: evaluation.rationale,
      });
      if (createRes.data) {
        cards.push({
          suggestionId: createRes.data.id,
          exerciseId: slot.exerciseId,
          exerciseName: slot.exerciseName,
          action: createRes.data.action,
          suggestedWeightKg: createRes.data.suggestedWeightKg,
          suggestedReps: createRes.data.suggestedReps,
          rationale: createRes.data.rationale,
          status: 'pending',
        });
      }
    }

    setCompleting(false);
    if (cards.length === 0) {
      onSessionCompleted?.();
      return;
    }
    setSuggestionCards(cards);
  }

  async function handleAcceptSuggestion(suggestionId: string) {
    await updateProgressionSuggestionStatus(client, userId, suggestionId, { status: 'accepted' });
    setSuggestionCards((prev) =>
      prev.map((c) => (c.suggestionId === suggestionId ? { ...c, status: 'accepted' } : c)),
    );
  }

  async function handleDeclineSuggestion(suggestionId: string) {
    await updateProgressionSuggestionStatus(client, userId, suggestionId, { status: 'declined' });
    setSuggestionCards((prev) =>
      prev.map((c) => (c.suggestionId === suggestionId ? { ...c, status: 'declined' } : c)),
    );
  }

  async function handleOverrideSuggestion(
    suggestionId: string,
    overriddenWeightKg: number | null,
    overriddenReps: number | null,
  ) {
    await updateProgressionSuggestionStatus(client, userId, suggestionId, {
      status: 'overridden',
      overriddenWeightKg,
      overriddenReps,
    });
    setSuggestionCards((prev) =>
      prev.map((c) => (c.suggestionId === suggestionId ? { ...c, status: 'overridden' } : c)),
    );
  }

  function handleDoneReviewingSuggestions() {
    setSuggestionCards([]);
    onSessionCompleted?.();
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="session-screen-loading">Loading...</Text>
      </View>
    );
  }

  if (suggestionCards.length > 0) {
    return (
      <ScrollView style={styles.container} testID="session-suggestions-review">
        <Text style={styles.title}>Session complete — what&apos;s next</Text>
        {suggestionCards.map((card) => (
          <ProgressionSuggestionCard
            key={card.suggestionId}
            exerciseId={card.exerciseId}
            exerciseName={card.exerciseName}
            action={card.action}
            suggestedWeightKg={card.suggestedWeightKg}
            suggestedReps={card.suggestedReps}
            rationale={card.rationale}
            status={card.status}
            onAccept={() => handleAcceptSuggestion(card.suggestionId)}
            onDecline={() => handleDeclineSuggestion(card.suggestionId)}
            onOverride={(weightKg, reps) => handleOverrideSuggestion(card.suggestionId, weightKg, reps)}
          />
        ))}
        <Pressable testID="session-suggestions-done" style={styles.button} onPress={handleDoneReviewingSuggestions}>
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const addableExercises = filterByEquipmentSubset(exerciseLibrary, availableEquipmentKeys);

  return (
    <ScrollView style={styles.container} testID="session-screen">
      {error ? (
        <Text testID="session-screen-error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {slots.map((slot) => (
        <View key={slot.id} style={styles.slotContainer}>
          {slot.skipped ? (
            <View testID={`session-slot-${slot.id}-skipped`} style={styles.skippedRow}>
              <Text style={styles.skippedText}>{slot.exerciseName} (skipped)</Text>
            </View>
          ) : (
            <SetLogger
              exerciseId={slot.exerciseId}
              exerciseName={slot.exerciseName}
              loggedSets={slot.loggedSets}
              onLogSet={(input) => handleLogSet(slot.id, input)}
              onRetrySet={handleRetrySet}
            />
          )}

          <View style={styles.slotActions}>
            <Pressable testID={`session-slot-${slot.id}-skip`} onPress={() => handleSkip(slot.id)}>
              <Text style={styles.actionText}>{slot.skipped ? 'Unskip' : 'Skip'}</Text>
            </Pressable>
            {!slot.skipped ? (
              <Pressable
                testID={`session-slot-${slot.id}-substitute-toggle`}
                onPress={() => toggleSubstituteOptions(slot.id)}
              >
                <Text style={styles.actionText}>Substitute</Text>
              </Pressable>
            ) : null}
          </View>

          {slot.showSubstituteOptions ? (
            <View testID={`session-slot-${slot.id}-substitute-options`}>
              {substituteOptionsFor(slot).map((candidate) => (
                <Pressable
                  key={candidate.id}
                  testID={`session-slot-${slot.id}-substitute-option-${candidate.id}`}
                  style={styles.optionRow}
                  onPress={() => handleSubstitute(slot.id, candidate)}
                >
                  <Text style={styles.optionText}>{candidate.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      <RestTimer />

      <Pressable testID="session-add-exercise-toggle" style={styles.button} onPress={() => setShowAddExercise((v) => !v)}>
        <Text style={styles.buttonText}>Add exercise</Text>
      </Pressable>
      {showAddExercise ? (
        <View testID="session-add-exercise-options">
          {addableExercises.map((exercise) => (
            <Pressable
              key={exercise.id}
              testID={`session-add-exercise-option-${exercise.id}`}
              style={styles.optionRow}
              onPress={() => handleAddExercise(exercise)}
            >
              <Text style={styles.optionText}>{exercise.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        testID="session-complete-button"
        style={styles.button}
        disabled={completing}
        onPress={handleCompleteSession}
      >
        <Text style={styles.buttonText}>{completing ? 'Completing…' : 'Complete session'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  error: { color: '#b00020', marginBottom: 12 },
  slotContainer: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 12 },
  skippedRow: { paddingVertical: 10 },
  skippedText: { color: '#888', fontStyle: 'italic' },
  slotActions: { flexDirection: 'row', gap: 16, marginTop: 8 },
  actionText: { color: '#111', fontWeight: '600', textDecorationLine: 'underline' },
  optionRow: { paddingVertical: 8 },
  optionText: { fontSize: 14 },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
