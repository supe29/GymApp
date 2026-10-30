import { getPersonalRecordsForUser, getProfile, type GymSupabaseClient, type PersonalRecordWithExerciseName } from 'api-client';
import { currentPersonalRecordsByBucket, formatWeight, type UnitPreference } from 'core';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../../components/EmptyState';

export interface PersonalRecordsScreenProps {
  client: GymSupabaseClient;
  userId: string;
  onStartWorkout?: () => void;
}

/** FR-8.2/FR-8.3/UX-8: the user's current personal records, one row per (exercise, rep count) bucket — derived automatically, never manually entered. */
export default function PersonalRecordsScreen({ client, userId, onStartWorkout }: PersonalRecordsScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<PersonalRecordWithExerciseName[]>([]);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>('metric');

  useEffect(() => {
    async function load() {
      const [recordsRes, profileRes] = await Promise.all([getPersonalRecordsForUser(client, userId), getProfile(client, userId)]);
      if (recordsRes.error) {
        setError(recordsRes.error);
      } else {
        setRecords(recordsRes.data ?? []);
      }
      if (profileRes.data) {
        setUnitPreference(profileRes.data.unit_preference);
      }
      setLoaded(true);
    }
    load();
  }, [client, userId]);

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="personal-records-loading">Loading...</Text>
      </View>
    );
  }

  const currentByBucket = currentPersonalRecordsByBucket(records);
  const current = [...currentByBucket.values()].sort(
    (a, b) => a.exerciseName.localeCompare(b.exerciseName) || a.repCount - b.repCount,
  );

  return (
    <ScrollView style={styles.container} testID="personal-records-screen">
      <Text style={styles.title}>Personal records</Text>

      {error ? (
        <Text testID="personal-records-error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {current.length === 0 ? (
        <EmptyState
          testID="personal-records-empty"
          title="No personal records yet"
          message="Complete a workout to start tracking your PRs automatically."
          actionLabel={onStartWorkout ? 'Start a workout' : undefined}
          onAction={onStartWorkout}
        />
      ) : (
        current.map((record) => (
          <View key={record.id} testID={`personal-record-${record.exerciseId}-${record.repCount}`} style={styles.row}>
            <Text style={styles.exerciseName}>{record.exerciseName}</Text>
            <Text style={styles.detail}>
              {record.repCount}-rep: {formatWeight(record.weightKg, unitPreference)}
            </Text>
            {record.estimatedOneRm != null ? (
              <Text style={styles.subtle}>Estimated 1RM: {formatWeight(record.estimatedOneRm, unitPreference)}</Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
  error: { color: '#b00020', marginBottom: 12 },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  exerciseName: { fontSize: 15, fontWeight: '600' },
  detail: { fontSize: 14, marginTop: 2 },
  subtle: { fontSize: 12, color: '#666', marginTop: 2 },
});
