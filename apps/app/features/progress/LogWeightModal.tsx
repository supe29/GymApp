import { kgToLb, lbToKg, type UnitPreference } from 'core';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import NumberStepper from '../../components/NumberStepper';

export interface LogWeightModalProps {
  unitPreference: UnitPreference;
  /** Starting value (kg): the user's latest entry, else their profile weight. */
  initialWeightKg?: number | null;
  onSubmit: (weightKg: number) => void;
  onCancel: () => void;
}

const STEP_KG = 0.5;
const STEP_LB = 1;
const DEFAULT_KG = 70;

/**
 * FR-8.1/UX-4/UX-8: logs a body weight entry in the user's preferred unit.
 * Starts from their most recent known weight, so a typical entry is a
 * small nudge or a single typed value.
 */
export default function LogWeightModal({ unitPreference, initialWeightKg, onSubmit, onCancel }: LogWeightModalProps) {
  const isImperial = unitPreference === 'imperial';
  const [displayValue, setDisplayValue] = useState<number | null>(() => {
    const kg = initialWeightKg ?? DEFAULT_KG;
    return isImperial ? Math.round(kgToLb(kg)) : Math.round(kg * 10) / 10;
  });

  function handleSubmit() {
    if (displayValue == null || displayValue <= 0) return;
    const weightKg = isImperial ? lbToKg(displayValue) : displayValue;
    onSubmit(weightKg);
  }

  return (
    <View style={styles.container} testID="log-weight-modal">
      <Text style={styles.title}>Log weight</Text>
      <View style={styles.stepperRow}>
        <NumberStepper
          testID="log-weight"
          label="weight"
          value={displayValue}
          onChange={setDisplayValue}
          step={isImperial ? STEP_LB : STEP_KG}
          unit={isImperial ? 'lb' : 'kg'}
        />
      </View>
      <Pressable testID="log-weight-submit" style={styles.submitButton} onPress={handleSubmit} accessibilityRole="button">
        <Text style={styles.submitButtonText}>Save</Text>
      </Pressable>
      <Pressable testID="log-weight-cancel" style={styles.cancelButton} onPress={onCancel} accessibilityRole="button">
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  stepperRow: { flexDirection: 'row', justifyContent: 'center' },
  submitButton: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  cancelButton: { marginTop: 12, alignItems: 'center' },
  cancelButtonText: { color: '#666' },
});
