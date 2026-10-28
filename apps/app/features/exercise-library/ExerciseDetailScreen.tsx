import type { ExerciseWithTags } from 'core';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export interface ExerciseDetailScreenProps {
  exercise: ExerciseWithTags;
  /** Maps a muscle-group key to its display name; falls back to the raw key if not provided. */
  muscleDisplayNames?: Record<string, string>;
  /** Maps an equipment-item key to its display name; falls back to the raw key if not provided. */
  equipmentDisplayNames?: Record<string, string>;
}

/**
 * FR-4.3: viewing an exercise (from any part of the app) indicates which
 * muscle group(s) it targets, consistent with the 3D model's taxonomy —
 * this screen is the one place that rendering happens, reused wherever an
 * exercise's detail is shown.
 */
export default function ExerciseDetailScreen({
  exercise,
  muscleDisplayNames = {},
  equipmentDisplayNames = {},
}: ExerciseDetailScreenProps) {
  const label = (key: string, map: Record<string, string>) => map[key] ?? key;

  return (
    <ScrollView style={styles.container} testID="exercise-detail-screen">
      <Text style={styles.title}>{exercise.name}</Text>
      <Text testID="exercise-detail-difficulty" style={styles.difficulty}>
        {exercise.difficulty}
      </Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Primary muscles</Text>
        <Text testID="exercise-detail-primary-muscles">
          {exercise.primaryMuscleKeys.length > 0
            ? exercise.primaryMuscleKeys.map((k) => label(k, muscleDisplayNames)).join(', ')
            : '—'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Secondary muscles</Text>
        <Text testID="exercise-detail-secondary-muscles">
          {exercise.secondaryMuscleKeys.length > 0
            ? exercise.secondaryMuscleKeys.map((k) => label(k, muscleDisplayNames)).join(', ')
            : '—'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Equipment needed</Text>
        <Text testID="exercise-detail-equipment">
          {exercise.requiredEquipmentKeys.length > 0
            ? exercise.requiredEquipmentKeys.map((k) => label(k, equipmentDisplayNames)).join(', ')
            : 'None (bodyweight)'}
        </Text>
      </View>

      {exercise.instructions ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          <Text testID="exercise-detail-instructions">{exercise.instructions}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 4 },
  difficulty: { color: '#666', marginBottom: 16, textTransform: 'capitalize' },
  section: { marginBottom: 16 },
  sectionTitle: { fontWeight: '600', marginBottom: 4 },
});
