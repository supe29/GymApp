import { formatRest, type RestBetweenSets } from 'core';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import NumberStepper from '../../components/NumberStepper';

export type SetSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface LoggedSetDisplay {
  id: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  syncStatus: SetSyncStatus;
}

export interface SetLoggerProps {
  exerciseId: string;
  exerciseName: string;
  loggedSets: LoggedSetDisplay[];
  onLogSet: (input: { weightKg: number | null; reps: number | null; rpe: number | null }) => void;
  onRetrySet?: (id: string) => void;
  /** FR-5.1: deletes a set logged by mistake (after an inline confirm). */
  onDeleteSet?: (id: string) => void;
  /** The plan's prescription for this exercise, when there is one (plan-attached sessions). */
  target?: SetTarget;
  /** The user's most recent set of this exercise from an earlier session. */
  previousSet?: PreviousSet;
  /** Shown under the exercise name and target, above the inputs (the session screen's movement demo). */
  headerAccessory?: ReactNode;
  /** FR-5.4: this exercise's rest between sets; logging a set starts it counting down. */
  rest?: RestBetweenSets;
}

/**
 * FR-5.4: counts down to `endsAt` (ms since epoch) from the wall clock, so it
 * stays right if the app is backgrounded; vibrates once when the rest is over.
 */
function useRestCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) clearInterval(interval);
    }, 250);
    return () => clearInterval(interval);
  }, [endsAt]);
  const remaining = endsAt === null ? null : Math.max(0, (endsAt - now) / 1000);
  const over = remaining === 0;
  useEffect(() => {
    if (over) Vibration.vibrate(400);
  }, [over]);
  return remaining;
}

export interface PreviousSet {
  weightKg: number | null;
  reps: number | null;
}

export interface SetTarget {
  sets: number;
  repsMin: number;
  repsMax: number | null;
  weightKg: number | null;
}

function formatTarget(target: SetTarget): string {
  const reps = target.repsMax != null && target.repsMax !== target.repsMin ? `${target.repsMin}–${target.repsMax}` : `${target.repsMin}`;
  const weight = target.weightKg != null ? ` @ ${target.weightKg} kg` : '';
  return `Target: ${target.sets} × ${reps} reps${weight}`;
}

const WEIGHT_STEP_KG = 2.5;
const REPS_STEP = 1;
const RPE_STEP = 0.5;

const SYNC_STATUS_LABEL: Record<SetSyncStatus, string> = {
  pending: 'Pending sync…',
  syncing: 'Syncing…',
  synced: 'Synced',
  failed: "Couldn't sync",
};

/**
 * FR-5.1/UX-4: logs sets for one exercise within a session, with large
 * +/- steppers whose values can also be typed (one-handed/glanceable gym
 * use, without dozens of taps for a big change). Purely presentational/orchestration — persistence and the
 * offline-sync queue are owned by the parent screen (SessionScreen /
 * FreeformSessionScreen), which supplies the already-logged sets
 * (including their sync status) and receives new entries via onLogSet.
 */
export default function SetLogger({
  exerciseId,
  exerciseName,
  loggedSets,
  onLogSet,
  onRetrySet,
  onDeleteSet,
  target,
  previousSet,
  headerAccessory,
  rest,
}: SetLoggerProps) {
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  // Pre-filled from the prescription (else last time's weight) so a
  // typical set is just "Log set"; values persist after logging, so
  // repeat sets need no re-entry.
  const [weightKg, setWeightKg] = useState<number | null>(target?.weightKg ?? previousSet?.weightKg ?? null);
  const [reps, setReps] = useState<number | null>(target?.repsMin ?? null);
  const [rpe, setRpe] = useState<number | null>(null);

  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [showRestWhy, setShowRestWhy] = useState(false);
  const restRemaining = useRestCountdown(restEndsAt);
  const setsLogged = loggedSets.length;
  const allTargetSetsDone = target ? setsLogged >= target.sets : false;

  function handleLogSet() {
    onLogSet({ weightKg, reps, rpe });
    // No rest to count once the prescribed sets are all done.
    const finished = target ? setsLogged + 1 >= target.sets : false;
    setRestEndsAt(rest && !finished ? Date.now() + rest.seconds * 1000 : null);
  }

  // After a delete: with no sets left there is nothing to rest from, so the
  // timer goes; otherwise the rest restarts from the full duration.
  function handleRestAfterDelete() {
    const remaining = setsLogged - 1;
    setRestEndsAt(rest && remaining > 0 ? Date.now() + rest.seconds * 1000 : null);
  }

  return (
    <View style={styles.container} testID={`set-logger-${exerciseId}`}>
      <Text style={styles.title}>{exerciseName}</Text>
      {target ? (
        <Text testID={`set-logger-${exerciseId}-target`} style={styles.targetText}>
          {formatTarget(target)}
          {' · '}
          {Math.min(loggedSets.length, target.sets)}/{target.sets} sets done
        </Text>
      ) : null}
      {previousSet?.weightKg != null ? (
        <Text testID={`set-logger-${exerciseId}-previous`} style={styles.targetText}>
          Last time: {previousSet.weightKg} kg × {previousSet.reps ?? '-'}
        </Text>
      ) : null}
      {rest ? (
        <View style={styles.restInfoRow}>
          <Text testID={`set-logger-${exerciseId}-rest`} style={styles.targetText}>
            {`Rest ${formatRest(rest.seconds)} between sets`}
          </Text>
          <Pressable
            testID={`set-logger-${exerciseId}-rest-why-toggle`}
            onPress={() => setShowRestWhy((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={`Why rest ${formatRest(rest.seconds)} on ${exerciseName}?`}
            accessibilityState={{ expanded: showRestWhy }}
          >
            <Text style={styles.whyLink}>Why?</Text>
          </Pressable>
        </View>
      ) : null}
      {rest && showRestWhy ? (
        <Text testID={`set-logger-${exerciseId}-rest-why`} style={styles.whyText}>
          {rest.reason}
        </Text>
      ) : null}
      {headerAccessory}

      {loggedSets.map((set, position) => (
        <View key={set.id} testID={`set-logger-${exerciseId}-set-${set.setIndex}`} style={styles.loggedRow}>
          {/* Numbered by position, so deleting a set leaves no gap (set_index stays unique in the DB). */}
          <Text style={styles.loggedText}>
            Set {position + 1}: {set.weightKg ?? '-'}kg × {set.reps ?? '-'}
            {set.rpe != null ? ` @RPE ${set.rpe}` : ''}
          </Text>
          <Text
            testID={`set-logger-${exerciseId}-set-${set.setIndex}-status`}
            style={[styles.statusText, set.syncStatus === 'failed' && styles.statusFailed]}
          >
            {SYNC_STATUS_LABEL[set.syncStatus]}
          </Text>
          {set.syncStatus === 'failed' && onRetrySet ? (
            <Pressable
              testID={`set-logger-${exerciseId}-set-${set.setIndex}-retry`}
              onPress={() => onRetrySet(set.id)}
              accessibilityRole="button"
              accessibilityLabel={`Retry syncing set ${position + 1}`}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
          {onDeleteSet ? (
            confirmingDeleteId === set.id ? (
              <View style={styles.deleteConfirmRow}>
                <Pressable
                  testID={`set-logger-${exerciseId}-set-${set.setIndex}-delete-confirm`}
                  onPress={() => {
                    setConfirmingDeleteId(null);
                    onDeleteSet(set.id);
                    handleRestAfterDelete();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Confirm delete set ${position + 1}`}
                  hitSlop={8}
                >
                  <Text style={styles.deleteText}>Delete set</Text>
                </Pressable>
                <Pressable
                  testID={`set-logger-${exerciseId}-set-${set.setIndex}-delete-cancel`}
                  onPress={() => setConfirmingDeleteId(null)}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={styles.retryText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                testID={`set-logger-${exerciseId}-set-${set.setIndex}-delete`}
                onPress={() => setConfirmingDeleteId(set.id)}
                accessibilityRole="button"
                accessibilityLabel={`Delete set ${position + 1} of ${exerciseName}`}
                hitSlop={8}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            )
          ) : null}
        </View>
      ))}

      {restRemaining !== null && !allTargetSetsDone ? (
        restRemaining > 0 ? (
          <View testID={`set-logger-${exerciseId}-rest-countdown`} style={styles.restBox} accessibilityLiveRegion="polite">
            <Text style={styles.restLabel}>Rest</Text>
            <Text testID={`set-logger-${exerciseId}-rest-remaining`} style={styles.restTime}>
              {formatRest(restRemaining)}
            </Text>
          </View>
        ) : (
          <View testID={`set-logger-${exerciseId}-rest-over`} style={[styles.restBox, styles.restOverBox]} accessibilityLiveRegion="polite">
            <Text style={styles.restOverText}>{`Rest over. Ready for set ${setsLogged + 1}.`}</Text>
          </View>
        )
      ) : null}

      <View style={styles.stepperRow}>
        <Text style={styles.stepperLabel}>Weight (kg)</Text>
        <NumberStepper
          testID={`set-logger-${exerciseId}-weight`}
          label="weight"
          value={weightKg}
          onChange={setWeightKg}
          step={WEIGHT_STEP_KG}
        />
      </View>

      <View style={styles.stepperRow}>
        <Text style={styles.stepperLabel}>Reps</Text>
        <NumberStepper
          testID={`set-logger-${exerciseId}-reps`}
          label="reps"
          value={reps}
          onChange={(v) => setReps(v == null ? null : Math.round(v))}
          step={REPS_STEP}
        />
      </View>

      <View style={styles.stepperRow}>
        <Text style={styles.stepperLabel}>RPE (optional)</Text>
        <NumberStepper
          testID={`set-logger-${exerciseId}-rpe`}
          label="RPE"
          value={rpe}
          onChange={setRpe}
          step={RPE_STEP}
          min={RPE_STEP}
          max={10}
          clearable
          placeholder="-"
        />
      </View>

      <Pressable testID={`set-logger-${exerciseId}-log-button`} style={styles.logButton} onPress={handleLogSet} accessibilityRole="button">
        <Text style={styles.logButtonText}>Log set</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  targetText: { fontSize: 14, color: '#444', marginBottom: 8 },
  loggedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  loggedText: { fontSize: 14 },
  statusText: { fontSize: 12, color: '#666' },
  statusFailed: { color: '#b00020', fontWeight: '600' },
  retryText: { fontSize: 12, color: '#111', fontWeight: '600', textDecorationLine: 'underline' },
  deleteButton: { marginLeft: 'auto' },
  deleteConfirmRow: { flexDirection: 'row', gap: 12, marginLeft: 'auto' },
  deleteText: { fontSize: 12, color: '#b00020', fontWeight: '600', textDecorationLine: 'underline' },
  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  stepperLabel: { fontSize: 14, fontWeight: '600' },
  logButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  logButtonText: { color: '#fff', fontWeight: '600' },
  restInfoRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  whyLink: { fontSize: 12, color: '#555', textDecorationLine: 'underline' },
  whyText: { fontSize: 12, color: '#666', marginBottom: 8 },
  restBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  restLabel: { color: '#ccc', fontSize: 14, fontWeight: '600' },
  restTime: { color: '#fff', fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  restOverBox: { backgroundColor: '#e3f1e4' },
  restOverText: { color: '#2e7d32', fontSize: 15, fontWeight: '700' },
});
