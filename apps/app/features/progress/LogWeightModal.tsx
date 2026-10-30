import { kgToLb, lbToKg, type UnitPreference } from 'core';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface LogWeightModalProps {
  unitPreference: UnitPreference;
  onSubmit: (weightKg: number) => void;
  onCancel: () => void;
}

const STEP_KG = 0.5;
const STEP_LB = 1;
const DEFAULT_KG = 70;

/** FR-8.1/UX-4/UX-8: logs a body weight entry via a stepper (steppers over free text, same convention as SetLogger.tsx), in the user's preferred unit. */
export default function LogWeightModal({ unitPreference, onSubmit, onCancel }: LogWeightModalProps) {
  const isImperial = unitPreference === 'imperial';
  const [displayValue, setDisplayValue] = useState(() => (isImperial ? Math.round(kgToLb(DEFAULT_KG)) : DEFAULT_KG));

  function adjust(delta: number) {
    setDisplayValue((prev) => Math.max(0, prev + delta));
  }

  function handleSubmit() {
    const weightKg = isImperial ? lbToKg(displayValue) : displayValue;
    onSubmit(weightKg);
  }

  return (
    <View style={styles.container} testID="log-weight-modal">
      <Text style={styles.title}>Log weight</Text>
      <View style={styles.stepperRow}>
        <Pressable testID="log-weight-dec" style={styles.stepperButton} onPress={() => adjust(-(isImperial ? STEP_LB : STEP_KG))}>
          <Text style={styles.stepperButtonText}>-</Text>
        </Pressable>
        <Text testID="log-weight-value" style={styles.stepperValue}>
          {displayValue} {isImperial ? 'lb' : 'kg'}
        </Text>
        <Pressable testID="log-weight-inc" style={styles.stepperButton} onPress={() => adjust(isImperial ? STEP_LB : STEP_KG)}>
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
      <Pressable testID="log-weight-submit" style={styles.submitButton} onPress={handleSubmit}>
        <Text style={styles.submitButtonText}>Save</Text>
      </Pressable>
      <Pressable testID="log-weight-cancel" style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  stepperButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  stepperValue: { fontSize: 18, fontWeight: '600', minWidth: 90, textAlign: 'center' },
  submitButton: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  cancelButton: { marginTop: 12, alignItems: 'center' },
  cancelButtonText: { color: '#666' },
});
