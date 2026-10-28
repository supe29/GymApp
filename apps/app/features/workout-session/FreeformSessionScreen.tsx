import {
  completeWorkoutSession,
  getExercisesWithTags,
  getUserEquipmentIds,
  listEquipmentItems,
  startWorkoutSession,
  type GymSupabaseClient,
} from 'api-client';
import { filterByEquipmentSubset, type ExerciseWithTags } from 'core';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSupabaseClient } from '../../lib/supabaseClient';
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
      const [sessionResult, equipmentIdsResult, equipmentItemsResult, exercisesResult] = await Promise.all([
        startWorkoutSession(client, userId),
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
    setCompleting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSessionCompleted?.();
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="freeform-session-loading">Loading...</Text>
      </View>
    );
  }

  const addedExerciseIds = new Set(slots.map((s) => s.exerciseId));
  const addableExercises = filterByEquipmentSubset(exerciseLibrary, availableEquipmentKeys).filter(
    (e) => !addedExerciseIds.has(e.id),
  );

  return (
    <ScrollView style={styles.container} testID="freeform-session-screen">
      {error ? (
        <Text testID="freeform-session-error" style={styles.error}>
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

      <Pressable testID="freeform-add-exercise-toggle" style={styles.button} onPress={() => setShowAddExercise((v) => !v)}>
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
      >
        <Text style={styles.buttonText}>{completing ? 'Completing…' : 'Complete session'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
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
