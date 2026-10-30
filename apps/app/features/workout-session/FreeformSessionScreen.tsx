import {
  completeWorkoutSession,
  createPersonalRecord,
  getExercisesWithTags,
  getProfile,
  getSetLogsForExercises,
  getSetLogsForSession,
  getUserEquipmentIds,
  listEquipmentItems,
  startWorkoutSession,
  type GymSupabaseClient,
} from 'api-client';
import { deriveNewPersonalRecords, filterByEquipmentSubset, type ExerciseWithTags, type UnitPreference } from 'core';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSupabaseClient } from '../../lib/supabaseClient';
import NewPersonalRecordCard from '../progress/NewPersonalRecordCard';
import { createOfflineQueue, generateLocalId, type OfflineQueueHandle } from './offlineQueue';
import RestTimer from './RestTimer';
import SetLogger, { type LoggedSetDisplay } from './SetLogger';

export interface FreeformSessionScreenProps {
  client?: GymSupabaseClient;
  userId: string;
  onSessionCompleted?: () => void;
}

interface FreeformSlot {
  exerciseId: string;
  exerciseName: string;
  nextSetIndex: number;
  loggedSets: LoggedSetDisplay[];
}

interface NewPrCardState {
  exerciseId: string;
  exerciseName: string;
  repCount: number;
  weightKg: number;
  estimatedOneRm: number;
}

/**
 * FR-5.2/FR-5.4/UX-4/NFR-3/AC-8: a freeform workout session — no plan
 * attachment (spec.md Flow 2.3). The user adds exercises one at a time
 * and logs sets exactly as in the plan-attached flow (SetLogger,
 * RestTimer, the offline-sync queue), but there is no prescribed
 * structure to pre-fill, skip, or substitute against.
 */
export default function FreeformSessionScreen({
  client = getSupabaseClient(),
  userId,
  onSessionCompleted,
}: FreeformSessionScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workoutSessionId, setWorkoutSessionId] = useState<string | null>(null);
  const [slots, setSlots] = useState<FreeformSlot[]>([]);
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseWithTags[]>([]);
  const [availableEquipmentKeys, setAvailableEquipmentKeys] = useState<string[]>([]);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [newPrCards, setNewPrCards] = useState<NewPrCardState[]>([]);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>('metric');
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
      const [sessionResult, equipmentIdsResult, equipmentItemsResult, exercisesResult, profileResult] = await Promise.all([
        startWorkoutSession(client, userId),
        getUserEquipmentIds(client, userId),
        listEquipmentItems(client),
        getExercisesWithTags(client),
        getProfile(client, userId),
      ]);
      if (profileResult.data) {
        setUnitPreference(profileResult.data.unit_preference);
      }

      if (sessionResult.error || !sessionResult.data) {
        setError(sessionResult.error ?? 'Failed to start workout session.');
        setLoaded(true);
        return;
      }
      setWorkoutSessionId(sessionResult.data.id);

      setExerciseLibrary(exercisesResult.data ?? []);
      const equipmentIds = new Set(equipmentIdsResult.data ?? []);
      const keys = (equipmentItemsResult.data ?? [])
        .filter((item) => equipmentIds.has(item.id))
        .map((item) => item.key);
      setAvailableEquipmentKeys(keys);
      setLoaded(true);
    }
    load();
  }, [client, userId]);

  function handleAddExercise(exercise: ExerciseWithTags) {
    setSlots((prev) => [
      ...prev,
      { exerciseId: exercise.id, exerciseName: exercise.name, nextSetIndex: 1, loggedSets: [] },
    ]);
    setShowAddExercise(false);
  }

  function handleLogSet(exerciseId: string, input: { weightKg: number | null; reps: number | null; rpe: number | null }) {
    if (!workoutSessionId || !queueRef.current) return;
    const slot = slots.find((s) => s.exerciseId === exerciseId);
    if (!slot) return;

    const setIndex = slot.nextSetIndex;
    const id = generateLocalId();

    setSlots((prev) =>
      prev.map((s) =>
        s.exerciseId === exerciseId
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
      exerciseId,
      setIndex,
      weightKg: input.weightKg,
      reps: input.reps,
      rpe: input.rpe,
    });
  }

  function handleRetrySet(id: string) {
    queueRef.current?.retryNow(id);
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

    // FR-8.2/AC-11/NFR-4: unlike Phase 8's progression suggestions (which
    // need a prescription row freeform sessions don't have), PR derivation
    // only needs raw set logs, so it applies here too.
    const logsRes = await getSetLogsForSession(client, userId, workoutSessionId);
    const confirmedLogs = logsRes.data ?? [];
    const touchedExerciseIds = [...new Set(slots.map((slot) => slot.exerciseId))];
    const allLogsRes = await getSetLogsForExercises(client, userId, touchedExerciseIds);
    const priorLogs = (allLogsRes.data ?? []).filter((log) => log.workoutSessionId !== workoutSessionId);
    const newPrs = deriveNewPersonalRecords(confirmedLogs, priorLogs);

    const prCards: NewPrCardState[] = [];
    for (const pr of newPrs) {
      const createRes = await createPersonalRecord(client, userId, pr);
      if (createRes.data) {
        const slot = slots.find((s) => s.exerciseId === pr.exerciseId);
        prCards.push({
          exerciseId: pr.exerciseId,
          exerciseName: slot?.exerciseName ?? pr.exerciseId,
          repCount: pr.repCount,
          weightKg: pr.weightKg,
          estimatedOneRm: pr.estimatedOneRm,
        });
      }
    }

    setCompleting(false);
    if (prCards.length === 0) {
      onSessionCompleted?.();
      return;
    }
    setNewPrCards(prCards);
  }

  function handleDoneReviewingPrs() {
    setNewPrCards([]);
    onSessionCompleted?.();
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="freeform-session-loading">Loading...</Text>
      </View>
    );
  }

  if (newPrCards.length > 0) {
    return (
      <ScrollView style={styles.container} testID="freeform-session-pr-review">
        <Text style={styles.title}>Session complete — what&apos;s next</Text>
        {newPrCards.map((card) => (
          <NewPersonalRecordCard
            key={`${card.exerciseId}-${card.repCount}`}
            exerciseName={card.exerciseName}
            repCount={card.repCount}
            weightKg={card.weightKg}
            estimatedOneRm={card.estimatedOneRm}
            unitPreference={unitPreference}
          />
        ))}
        <Pressable testID="freeform-session-pr-review-done" style={styles.button} onPress={handleDoneReviewingPrs} accessibilityRole="button">
          <Text style={styles.buttonText}>Done</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const addedExerciseIds = new Set(slots.map((s) => s.exerciseId));
  const addableExercises = filterByEquipmentSubset(exerciseLibrary, availableEquipmentKeys).filter(
    (e) => !addedExerciseIds.has(e.id),
  );

  return (
    <ScrollView style={styles.container} testID="freeform-session-screen">
      {error ? (
        <Text testID="freeform-session-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {slots.length === 0 ? (
        <Text testID="freeform-session-empty" style={styles.empty}>
          Add an exercise to get started.
        </Text>
      ) : null}

      {slots.map((slot) => (
        <SetLogger
          key={slot.exerciseId}
          exerciseId={slot.exerciseId}
          exerciseName={slot.exerciseName}
          loggedSets={slot.loggedSets}
          onLogSet={(input) => handleLogSet(slot.exerciseId, input)}
          onRetrySet={handleRetrySet}
        />
      ))}

      <RestTimer />

      <Pressable
        testID="freeform-add-exercise-toggle"
        style={styles.button}
        onPress={() => setShowAddExercise((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showAddExercise }}
      >
        <Text style={styles.buttonText}>Add exercise</Text>
      </Pressable>
      {showAddExercise ? (
        <View testID="freeform-add-exercise-options">
          {addableExercises.map((exercise) => (
            <Pressable
              key={exercise.id}
              testID={`freeform-add-exercise-option-${exercise.id}`}
              style={styles.optionRow}
              onPress={() => handleAddExercise(exercise)}
              accessibilityRole="button"
            >
              <Text style={styles.optionText}>{exercise.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Pressable
        testID="freeform-complete-button"
        style={styles.button}
        disabled={completing}
        onPress={handleCompleteSession}
        accessibilityRole="button"
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
  empty: { color: '#666', marginBottom: 16 },
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
