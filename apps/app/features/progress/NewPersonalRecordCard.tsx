import { formatWeight, type UnitPreference } from 'core';
import { StyleSheet, Text, View } from 'react-native';

export interface NewPersonalRecordCardProps {
  exerciseName: string;
  repCount: number;
  weightKg: number;
  estimatedOneRm: number;
  unitPreference: UnitPreference;
}

/** FR-8.2/AC-11: visibly flags a newly-derived PR, shown in the post-session review step. */
export default function NewPersonalRecordCard({
  exerciseName,
  repCount,
  weightKg,
  estimatedOneRm,
  unitPreference,
}: NewPersonalRecordCardProps) {
  return (
    <View
      style={styles.container}
      testID={`new-pr-card-${exerciseName}-${repCount}`}
      accessibilityRole="alert"
    >
      <Text style={styles.badge}>New Personal Record!</Text>
      <Text style={styles.title}>{exerciseName}</Text>
      <Text style={styles.detail}>
        {repCount}-rep PR: {formatWeight(weightKg, unitPreference)}
      </Text>
      <Text style={styles.subtle}>Estimated 1RM: {formatWeight(estimatedOneRm, unitPreference)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#f0fff4', borderRadius: 8, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#b7e4c7' },
  badge: { color: '#2d6a4f', fontWeight: '700', fontSize: 12, marginBottom: 4 },
  title: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 14, marginTop: 2 },
  subtle: { fontSize: 12, color: '#666', marginTop: 2 },
});
