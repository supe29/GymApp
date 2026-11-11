import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  /** The plan's prescription for this exercise, when there is one (plan-attached sessions). */
  target?: SetTarget;
  /** The user's most recent set of this exercise from an earlier session. */
  previousSet?: PreviousSet;
  /** Shown under the exercise name and target, above the inputs (the session screen's movement demo). */
  headerAccessory?: ReactNode;
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
  target,
  previousSet,
  headerAccessory,
}: SetLoggerProps) {
  // Pre-filled from the prescription (else last time's weight) so a
  // typical set is just "Log set"; values persist after logging, so
  // repeat sets need no re-entry.
  const [weightKg, setWeightKg] = useState<number | null>(target?.weightKg ?? previousSet?.weightKg ?? null);
  const [reps, setReps] = useState<number | null>(target?.repsMin ?? null);
  const [rpe, setRpe] = useState<number | null>(null);

  function handleLogSet() {
    onLogSet({ weightKg, reps, rpe });
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
      {headerAccessory}

      {loggedSets.map((set) => (
        <View key={set.id} testID={`set-logger-${exerciseId}-set-${set.setIndex}`} style={styles.loggedRow}>
          <Text style={styles.loggedText}>
            Set {set.setIndex}: {set.weightKg ?? '-'}kg × {set.reps ?? '-'}
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
              accessibilityLabel={`Retry syncing set ${set.setIndex}`}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

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
});
