import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
 * numeric steppers rather than free-text entry (one-handed/glanceable gym
 * use). Purely presentational/orchestration — persistence and the
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
}: SetLoggerProps) {
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [reps, setReps] = useState<number | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);

  function adjustWeight(delta: number) {
    setWeightKg((prev) => Math.max(0, (prev ?? 0) + delta));
  }
  function adjustReps(delta: number) {
    setReps((prev) => Math.max(0, (prev ?? 0) + delta));
  }
  function adjustRpe(delta: number) {
    setRpe((prev) => {
      const next = (prev ?? 0) + delta;
      if (next <= 0) return null;
      return Math.min(10, next);
    });
  }

  function handleLogSet() {
    onLogSet({ weightKg, reps, rpe });
  }

  return (
    <View style={styles.container} testID={`set-logger-${exerciseId}`}>
      <Text style={styles.title}>{exerciseName}</Text>

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
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      <View style={styles.stepperRow}>
        <Text style={styles.stepperLabel}>Weight (kg)</Text>
        <View style={styles.stepperControls}>
          <Pressable testID={`set-logger-${exerciseId}-weight-dec`} style={styles.stepperButton} onPress={() => adjustWeight(-WEIGHT_STEP_KG)}>
            <Text style={styles.stepperButtonText}>-</Text>
          </Pressable>
          <Text testID={`set-logger-${exerciseId}-weight-value`} style={styles.stepperValue}>
            {weightKg ?? 0}
          </Text>
          <Pressable testID={`set-logger-${exerciseId}-weight-inc`} style={styles.stepperButton} onPress={() => adjustWeight(WEIGHT_STEP_KG)}>
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.stepperRow}>
        <Text style={styles.stepperLabel}>Reps</Text>
        <View style={styles.stepperControls}>
          <Pressable testID={`set-logger-${exerciseId}-reps-dec`} style={styles.stepperButton} onPress={() => adjustReps(-REPS_STEP)}>
            <Text style={styles.stepperButtonText}>-</Text>
          </Pressable>
          <Text testID={`set-logger-${exerciseId}-reps-value`} style={styles.stepperValue}>
            {reps ?? 0}
          </Text>
          <Pressable testID={`set-logger-${exerciseId}-reps-inc`} style={styles.stepperButton} onPress={() => adjustReps(REPS_STEP)}>
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.stepperRow}>
        <Text style={styles.stepperLabel}>RPE (optional)</Text>
        <View style={styles.stepperControls}>
          <Pressable testID={`set-logger-${exerciseId}-rpe-dec`} style={styles.stepperButton} onPress={() => adjustRpe(-RPE_STEP)}>
            <Text style={styles.stepperButtonText}>-</Text>
          </Pressable>
          <Text testID={`set-logger-${exerciseId}-rpe-value`} style={styles.stepperValue}>
            {rpe ?? '-'}
          </Text>
          <Pressable testID={`set-logger-${exerciseId}-rpe-inc`} style={styles.stepperButton} onPress={() => adjustRpe(RPE_STEP)}>
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>
      </View>

      <Pressable testID={`set-logger-${exerciseId}-log-button`} style={styles.logButton} onPress={handleLogSet}>
        <Text style={styles.logButtonText}>Log set</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  loggedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  loggedText: { fontSize: 14 },
  statusText: { fontSize: 12, color: '#666' },
  statusFailed: { color: '#b00020', fontWeight: '600' },
  retryText: { fontSize: 12, color: '#111', fontWeight: '600', textDecorationLine: 'underline' },
  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  stepperLabel: { fontSize: 14, fontWeight: '600' },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepperButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  stepperValue: { fontSize: 18, fontWeight: '600', minWidth: 40, textAlign: 'center' },
  logButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  logButtonText: { color: '#fff', fontWeight: '600' },
});
