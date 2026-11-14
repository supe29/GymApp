import {
  completeWorkoutSession,
  createPersonalRecord,
  createProgressionSuggestion,
  getExercisesWithTags,
  getPlannedSessionById,
  getProfile,
  getSetLogsForExercises,
  getSetLogsForSession,
  getUserEquipmentIds,
  listEquipmentItems,
  startWorkoutSession,
  updateProgressionSuggestionStatus,
  type GymSupabaseClient,
} from 'api-client';
import {
  deriveNewPersonalRecords,
  evaluateExercisePerformance,
  filterByEquipmentSubset,
  restBetweenSets,
  filterByMuscleGroup,
  type ExerciseWithTags,
  type FitnessLevel,
  type Goal,
  type SessionAiFacts,
  type SessionSummary as SessionSummaryData,
  type ProgressionAction,
  type UnitPreference,
} from 'core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import ExerciseDemoPanel, { DemoModelCredit } from '../../components/ExerciseDemoPanel';
import ExercisePicker from '../../components/ExercisePicker';
import { getSupabaseClient } from '../../lib/supabaseClient';
import ProgressionSuggestionCard from '../plan/ProgressionSuggestionCard';
import NewPersonalRecordCard from '../progress/NewPersonalRecordCard';
import { createOfflineQueue, generateLocalId, type OfflineQueueHandle } from './offlineQueue';
import SetLogger, { type LoggedSetDisplay, type PreviousSet } from './SetLogger';
import { buildSummaryForSession } from './buildSummaryForSession';
import SessionSummary from './SessionSummary';

export interface SessionScreenProps {
  client?: GymSupabaseClient;
  userId: string;
  plannedSessionId: string;
  /** FR-2.6: a missed planned session merged into this one; its exercises are appended (de-duplicated). */
  mergedPlannedSessionId?: string;
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
  /** The user's most recent logged set of this exercise from an earlier session, if any. */
  previousSet?: PreviousSet | null;
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

interface NewPrCardState {
  exerciseId: string;
  exerciseName: string;
  repCount: number;
  weightKg: number;
  estimatedOneRm: number;
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
 * This screen has no calendar concept of its own: plannedSessionId is an
 * explicit prop. Scheduling and missed days (FR-2.5/FR-2.6) are decided by
 * the Plan screen and dashboard; a missed session merged into today's
 * arrives here as mergedPlannedSessionId.
 */
export default function SessionScreen({
  client = getSupabaseClient(),
  userId,
  plannedSessionId,
  mergedPlannedSessionId,
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
  const [confirmingIncomplete, setConfirmingIncomplete] = useState(false);
  const [suggestionCards, setSuggestionCards] = useState<SuggestionCardState[]>([]);
  const [newPrCards, setNewPrCards] = useState<NewPrCardState[]>([]);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>('metric');
  const [profileGoal, setProfileGoal] = useState<{ goal: Goal; fitnessLevel: FitnessLevel } | null>(null);
  // FR-5.4: each exercise's rest between sets, from the user's goal and the exercise's mechanic.
  const restByExerciseId = useMemo(
    () => new Map(exerciseLibrary.map((e) => [e.id, restBetweenSets(profileGoal?.goal, e.mechanic)] as const)),
    [exerciseLibrary, profileGoal],
  );
  const [sessionMeta, setSessionMeta] = useState<{ name: string; startedAt: string | null }>({ name: 'Workout', startedAt: null });
  // FR-8.4: set once the session is completed; the summary then replaces the logging view.
  const [completedSummary, setCompletedSummary] = useState<{ summary: SessionSummaryData; aiFacts: SessionAiFacts } | null>(null);
  // Every exercise shows its movement demo by default; these are the ones the user has hidden.
  // Keyed by slot id, so a substitution swaps the demo to the new exercise.
  const [hiddenDemoSlotIds, setHiddenDemoSlotIds] = useState<ReadonlySet<string>>(new Set());
  const queueRef = useRef<OfflineQueueHandle | null>(null);
  // Stable per-exercise objects, so an open demo figure isn't handed a new muscles prop on every render.
  const musclesByExerciseId = useMemo(
    () =>
      new Map(
        exerciseLibrary.map((e) => [e.id, { primary: e.primaryMuscleKeys, secondary: e.secondaryMuscleKeys }] as const),
      ),
    [exerciseLibrary],
  );

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
      const [sessionResult, mainPlannedResult, mergedResult, equipmentIdsResult, equipmentItemsResult, exercisesResult, profileResult] =
        await Promise.all([
          startWorkoutSession(client, userId, plannedSessionId),
          getPlannedSessionById(client, userId, plannedSessionId),
          mergedPlannedSessionId ? getPlannedSessionById(client, userId, mergedPlannedSessionId) : Promise.resolve(null),
          getUserEquipmentIds(client, userId),
          listEquipmentItems(client),
          getExercisesWithTags(client),
          getProfile(client, userId),
        ]);
      // FR-2.6 merge: today's session first, then the missed session's
      // exercises it doesn't already include. Each keeps its own
      // planned_session_exercises row, so progression still works per exercise.
      const merged = mergedResult?.data ?? null;
      const plannedResult =
        mainPlannedResult.data && merged
          ? {
              ...mainPlannedResult,
              data: {
                ...mainPlannedResult.data,
                name: `${mainPlannedResult.data.name} + ${merged.name}`,
                exercises: [
                  ...mainPlannedResult.data.exercises,
                  ...merged.exercises.filter(
                    (ex) => !mainPlannedResult.data?.exercises.some((own) => own.exerciseId === ex.exerciseId),
                  ),
                ],
              },
            }
          : mainPlannedResult;
      if (profileResult.data) {
        setUnitPreference(profileResult.data.unit_preference);
        setProfileGoal({ goal: profileResult.data.goal, fitnessLevel: profileResult.data.fitness_level });
      }

      if (sessionResult.error || !sessionResult.data) {
        setError(sessionResult.error ?? 'Failed to start workout session.');
        setLoaded(true);
        return;
      }
      setWorkoutSessionId(sessionResult.data.id);
      setSessionMeta({ name: plannedResult.data?.name ?? 'Workout', startedAt: sessionResult.data.startedAt || null });

      if (plannedResult.data) {
        // Most recent previously logged set per exercise, so the logger can
        // start from what the user actually lifted last time (a generated
        // plan has no target weight until progression sets one).
        const previousLogsRes = await getSetLogsForExercises(
          client,
          userId,
          plannedResult.data.exercises.map((ex) => ex.exerciseId),
        );
        const previousSetByExercise = new Map<string, PreviousSet>();
        const sortedPrevious = [...(previousLogsRes?.data ?? [])]
          .filter((log) => log.workoutSessionId !== sessionResult.data?.id && log.weightKg != null)
          .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
        for (const log of sortedPrevious) {
          previousSetByExercise.set(log.exerciseId, { weightKg: log.weightKg, reps: log.reps });
        }

        setSlots(
          plannedResult.data.exercises.map((ex) => ({
            previousSet: previousSetByExercise.get(ex.exerciseId) ?? null,
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
  }, [client, userId, plannedSessionId, mergedPlannedSessionId]);

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
              previousSet: null,
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

  // Exercises still in the plan for today that have nothing logged —
  // completing now records them as missed for progression purposes.
  const untouchedSlots = slots.filter((slot) => !slot.skipped && slot.loggedSets.length === 0);

  function handleCompletePress() {
    if (untouchedSlots.length > 0 && !confirmingIncomplete) {
      setConfirmingIncomplete(true);
      return;
    }
    void handleCompleteSession();
  }

  async function handleCompleteSession() {
    if (!workoutSessionId) return;
    setConfirmingIncomplete(false);
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

    // FR-8.2/AC-11/NFR-4: derive new PRs from the same confirmed logs, for
    // every non-skipped exercise (including added ones — unlike
    // progression suggestions, a PR needs no prescription row). Reads
    // prior history through the same api-client fetch Phase 8 established
    // for confirmed logs, never a separate/divergent query path.
    const touchedExerciseIds = [...new Set(slots.filter((slot) => !slot.skipped).map((slot) => slot.exerciseId))];
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

    // FR-8.4: the summary is shown after every session, whether or not
    // there are PRs or suggestions to review.
    const built = await buildSummaryForSession({
      client,
      userId,
      sessionName: sessionMeta.name,
      startedAt: sessionMeta.startedAt,
      goal: profileGoal?.goal ?? null,
      fitnessLevel: profileGoal?.fitnessLevel ?? null,
      unitPreference,
      exerciseLibrary,
      exercises: slots.map((slot) => ({
        exerciseId: slot.exerciseId,
        name: slot.exerciseName,
        targetSets: slot.targetSets,
        targetRepsMin: slot.targetRepsMin,
        targetRepsMax: slot.targetRepsMax,
        skipped: slot.skipped,
      })),
      logs: confirmedLogs,
      priorLogs,
      newPrs: prCards.map((pr) => ({ exerciseName: pr.exerciseName, repCount: pr.repCount, weightKg: pr.weightKg })),
      progression: cards.map((card) => ({
        exerciseName: card.exerciseName,
        action: card.action,
        suggestedWeightKg: card.suggestedWeightKg,
        suggestedReps: card.suggestedReps,
      })),
      completedPlannedSessionId: plannedSessionId,
    });

    setCompleting(false);
    setSuggestionCards(cards);
    setNewPrCards(prCards);
    setCompletedSummary(built);
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
    setNewPrCards([]);
    setCompletedSummary(null);
    onSessionCompleted?.();
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="session-screen-loading">Loading...</Text>
      </View>
    );
  }

  if (completedSummary) {
    return (
      <SessionSummary
        client={client}
        summary={completedSummary.summary}
        aiFacts={completedSummary.aiFacts}
        unitPreference={unitPreference}
        onDone={handleDoneReviewingSuggestions}
        prSection={
          newPrCards.length > 0
            ? newPrCards.map((card) => (
                <NewPersonalRecordCard
                  key={`${card.exerciseId}-${card.repCount}`}
                  exerciseName={card.exerciseName}
                  repCount={card.repCount}
                  weightKg={card.weightKg}
                  estimatedOneRm={card.estimatedOneRm}
                  unitPreference={unitPreference}
                />
              ))
            : undefined
        }
        progressionSection={
          suggestionCards.length > 0
            ? suggestionCards.map((card) => (
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
              ))
            : undefined
        }
      />
    );
  }

  const addableExercises = filterByEquipmentSubset(exerciseLibrary, availableEquipmentKeys);

  function musclesForExercise(exerciseId: string) {
    return musclesByExerciseId.get(exerciseId) ?? null;
  }

  function toggleDemo(slotId: string) {
    setHiddenDemoSlotIds((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  }

  return (
    <ScrollView style={styles.container} testID="session-screen">
      {error ? (
        <Text testID="session-screen-error" style={styles.error} accessibilityRole="alert">
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
              previousSet={slot.previousSet ?? undefined}
              rest={restByExerciseId.get(slot.exerciseId) ?? restBetweenSets(profileGoal?.goal, null)}
              headerAccessory={
                hiddenDemoSlotIds.has(slot.id) ? null : (
                  <ExerciseDemoPanel
                    exerciseName={slot.exerciseName}
                    muscles={musclesForExercise(slot.exerciseId)}
                    testID={`session-slot-${slot.id}-demo`}
                  />
                )
              }
              target={
                slot.targetSets > 0
                  ? {
                      sets: slot.targetSets,
                      repsMin: slot.targetRepsMin,
                      repsMax: slot.targetRepsMax,
                      weightKg: slot.targetWeightKg,
                    }
                  : undefined
              }
            />
          )}

          <View style={styles.slotActions}>
            <Pressable testID={`session-slot-${slot.id}-skip`} onPress={() => handleSkip(slot.id)} accessibilityRole="button">
              <Text style={styles.actionText}>{slot.skipped ? 'Unskip' : 'Skip'}</Text>
            </Pressable>
            {!slot.skipped ? (
              <Pressable
                testID={`session-slot-${slot.id}-substitute-toggle`}
                onPress={() => toggleSubstituteOptions(slot.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded: slot.showSubstituteOptions }}
              >
                <Text style={styles.actionText}>Substitute</Text>
              </Pressable>
            ) : null}
            {!slot.skipped ? (
              <Pressable
                testID={`session-slot-${slot.id}-demo-toggle`}
                onPress={() => toggleDemo(slot.id)}
                accessibilityRole="button"
                accessibilityLabel={`${hiddenDemoSlotIds.has(slot.id) ? 'Show' : 'Hide'} how to do ${slot.exerciseName}`}
                accessibilityState={{ expanded: !hiddenDemoSlotIds.has(slot.id) }}
              >
                <Text style={styles.actionText}>{hiddenDemoSlotIds.has(slot.id) ? 'Show demo' : 'Hide demo'}</Text>
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
                  accessibilityRole="button"
                >
                  <Text style={styles.optionText}>{candidate.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      <Pressable
        testID="session-add-exercise-toggle"
        style={styles.button}
        onPress={() => setShowAddExercise((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: showAddExercise }}
      >
        <Text style={styles.buttonText}>Add exercise</Text>
      </Pressable>
      {showAddExercise ? (
        <View testID="session-add-exercise-options">
          <ExercisePicker exercises={addableExercises} onSelect={handleAddExercise} testIDPrefix="session-add-exercise" autoFocus />
        </View>
      ) : null}

      {confirmingIncomplete ? (
        <View testID="session-complete-warning" style={styles.warningBox} accessibilityRole="alert">
          <Text style={styles.warningText}>
            {untouchedSlots.length === 1
              ? `${untouchedSlots[0].exerciseName} has no sets logged.`
              : `${untouchedSlots.length} exercises have no sets logged.`}{' '}
            Skip them or log sets first, or complete anyway and they will count as missed.
          </Text>
          <View style={styles.warningActions}>
            <Pressable
              testID="session-complete-keep-training"
              onPress={() => setConfirmingIncomplete(false)}
              accessibilityRole="button"
            >
              <Text style={styles.actionText}>Keep training</Text>
            </Pressable>
            <Pressable testID="session-complete-confirm" onPress={handleCompleteSession} accessibilityRole="button">
              <Text style={styles.actionText}>Complete anyway</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <Pressable
        testID="session-complete-button"
        style={styles.button}
        disabled={completing}
        onPress={handleCompletePress}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{completing ? 'Completing…' : 'Complete session'}</Text>
      </Pressable>
      {slots.some((slot) => !slot.skipped && !hiddenDemoSlotIds.has(slot.id)) ? <DemoModelCredit /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  error: { color: '#b00020', marginBottom: 12 },
  warningBox: { backgroundColor: '#fff4e5', borderRadius: 8, padding: 12, marginTop: 12 },
  warningText: { color: '#5c3b00', marginBottom: 8 },
  warningActions: { flexDirection: 'row', justifyContent: 'space-between' },
  slotContainer: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 12 },
  skippedRow: { paddingVertical: 10 },
  skippedText: { color: '#666', fontStyle: 'italic' },
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
