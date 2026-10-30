import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type ProgressionAction = 'increase_weight' | 'increase_reps' | 'hold';
export type ProgressionSuggestionStatus = 'pending' | 'accepted' | 'declined' | 'overridden';

export interface ProgressionSuggestionCardProps {
  exerciseId: string;
  exerciseName: string;
  action: ProgressionAction;
  suggestedWeightKg: number | null;
  suggestedReps: number | null;
  rationale: string;
  status?: ProgressionSuggestionStatus;
  onAccept: () => void;
  onDecline: () => void;
  onOverride: (overriddenWeightKg: number | null, overriddenReps: number | null) => void;
}

const ACTION_LABEL: Record<ProgressionAction, string> = {
  increase_weight: 'Increase weight',
  increase_reps: 'Increase reps',
  hold: 'Hold',
};

const WEIGHT_STEP_KG = 2.5;
const REPS_STEP = 1;

/**
 * FR-6.2/FR-6.3: one progression suggestion, always showing its
 * plain-language rationale (FR-6.3), with accept/decline/manual-override
 * (FR-6.2). Pure presentational — the parent screen owns all
 * progression_suggestions persistence. Overriding is always available
 * regardless of the suggested action (SR-4 constrains what the engine
 * itself may suggest, not the user's own manual choice).
 */
export default function ProgressionSuggestionCard({
  exerciseId,
  exerciseName,
  action,
  suggestedWeightKg,
  suggestedReps,
  rationale,
  status = 'pending',
  onAccept,
  onDecline,
  onOverride,
}: ProgressionSuggestionCardProps) {
  const [showOverride, setShowOverride] = useState(false);
  const [overrideWeightKg, setOverrideWeightKg] = useState(suggestedWeightKg ?? 0);
  const [overrideReps, setOverrideReps] = useState(suggestedReps ?? 0);

  function handleConfirmOverride() {
    onOverride(overrideWeightKg, overrideReps);
    setShowOverride(false);
  }

  return (
    <View testID={`progression-card-${exerciseId}`} style={styles.container}>
      <Text style={styles.exerciseName}>{exerciseName}</Text>
      <Text testID={`progression-card-${exerciseId}-action`} style={styles.actionLabel}>
        {ACTION_LABEL[action]}
        {suggestedWeightKg !== null ? ` — ${suggestedWeightKg}kg` : ''}
        {suggestedReps !== null ? ` × ${suggestedReps} reps` : ''}
      </Text>
      <Text testID={`progression-card-${exerciseId}-rationale`} style={styles.rationale}>
        {rationale}
      </Text>

      {status === 'pending' ? (
        showOverride ? (
          <View>
            <View style={styles.stepperRow}>
              <Text style={styles.stepperLabel}>Weight (kg)</Text>
              <View style={styles.stepperControls}>
                <Pressable
                  testID={`progression-card-${exerciseId}-override-weight-dec`}
                  style={styles.stepperButton}
                  onPress={() => setOverrideWeightKg((v) => Math.max(0, v - WEIGHT_STEP_KG))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease override weight"
                >
                  <Text style={styles.stepperButtonText}>-</Text>
                </Pressable>
                <Text testID={`progression-card-${exerciseId}-override-weight-value`} style={styles.stepperValue}>
                  {overrideWeightKg}
                </Text>
                <Pressable
                  testID={`progression-card-${exerciseId}-override-weight-inc`}
                  style={styles.stepperButton}
                  onPress={() => setOverrideWeightKg((v) => v + WEIGHT_STEP_KG)}
                  accessibilityRole="button"
                  accessibilityLabel="Increase override weight"
                >
                  <Text style={styles.stepperButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.stepperRow}>
              <Text style={styles.stepperLabel}>Reps</Text>
              <View style={styles.stepperControls}>
                <Pressable
                  testID={`progression-card-${exerciseId}-override-reps-dec`}
                  style={styles.stepperButton}
                  onPress={() => setOverrideReps((v) => Math.max(0, v - REPS_STEP))}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease override reps"
                >
                  <Text style={styles.stepperButtonText}>-</Text>
                </Pressable>
                <Text testID={`progression-card-${exerciseId}-override-reps-value`} style={styles.stepperValue}>
                  {overrideReps}
                </Text>
                <Pressable
                  testID={`progression-card-${exerciseId}-override-reps-inc`}
                  style={styles.stepperButton}
                  onPress={() => setOverrideReps((v) => v + REPS_STEP)}
                  accessibilityRole="button"
                  accessibilityLabel="Increase override reps"
                >
                  <Text style={styles.stepperButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Pressable
              testID={`progression-card-${exerciseId}-override-confirm`}
              style={styles.button}
              onPress={handleConfirmOverride}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Confirm override</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.actionsRow}>
            <Pressable testID={`progression-card-${exerciseId}-accept`} style={styles.button} onPress={onAccept} accessibilityRole="button">
              <Text style={styles.buttonText}>Accept</Text>
            </Pressable>
            <Pressable
              testID={`progression-card-${exerciseId}-decline`}
              style={[styles.button, styles.buttonSecondary]}
              onPress={onDecline}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Decline</Text>
            </Pressable>
            <Pressable
              testID={`progression-card-${exerciseId}-override-toggle`}
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => setShowOverride(true)}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Override</Text>
            </Pressable>
          </View>
        )
      ) : (
        <Text testID={`progression-card-${exerciseId}-resolved`} style={styles.resolvedText}>
          {status === 'accepted' ? 'Accepted' : status === 'declined' ? 'Declined' : 'Overridden'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 14 },
  exerciseName: { fontSize: 16, fontWeight: '600' },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 4 },
  rationale: { fontSize: 13, color: '#555', marginTop: 6, marginBottom: 10 },
  actionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  button: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginTop: 6 },
  buttonSecondary: { backgroundColor: '#666' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  stepperLabel: { fontSize: 13, fontWeight: '600' },
  stepperControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepperButton: {
    backgroundColor: '#111',
    borderRadius: 6,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  stepperValue: { fontSize: 15, fontWeight: '600', minWidth: 36, textAlign: 'center' },
  resolvedText: { fontSize: 13, color: '#666', fontStyle: 'italic' },
});
