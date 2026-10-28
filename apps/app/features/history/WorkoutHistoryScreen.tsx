import { getWorkoutSessionHistory, type GymSupabaseClient, type WorkoutSessionHistoryEntry } from 'api-client';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { getSupabaseClient } from '../../lib/supabaseClient';

export interface WorkoutHistoryScreenProps {
  client?: GymSupabaseClient;
  userId: string;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

/** FR-5.5/AC-8: lists the user's past workout sessions, plan-attached or freeform. */
export default function WorkoutHistoryScreen({ client = getSupabaseClient(), userId }: WorkoutHistoryScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<WorkoutSessionHistoryEntry[]>([]);

  useEffect(() => {
    async function load() {
      const result = await getWorkoutSessionHistory(client, userId);
      if (result.error) {
        setError(result.error);
      } else {
        setEntries(result.data ?? []);
      }
      setLoaded(true);
    }
    load();
  }, [client, userId]);

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="history-loading">Loading...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text testID="history-error" style={styles.error}>
          {error}
        </Text>
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.container}>
        <Text testID="history-empty">No workout sessions logged yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      testID="history-list"
      style={styles.container}
      data={entries}
      keyExtractor={(entry) => entry.session.id}
      renderItem={({ item }) => {
        const exerciseIds = [...new Set(item.setLogs.map((log) => log.exerciseId))];

        return (
          <View testID={`history-session-${item.session.id}`} style={styles.sessionCard}>
            <Text style={styles.sessionDate}>{formatDate(item.session.startedAt)}</Text>
            <Text testID={`history-session-${item.session.id}-type`} style={styles.sessionType}>
              {item.session.plannedSessionId ? 'Plan-attached' : 'Freeform'}
            </Text>
            {exerciseIds.map((exerciseId) => {
              const setCount = item.setLogs.filter((log) => log.exerciseId === exerciseId).length;
              return (
                <Text key={exerciseId} testID={`history-session-${item.session.id}-exercise-${exerciseId}`} style={styles.exerciseLine}>
                  {item.exerciseNames[exerciseId] ?? exerciseId}: {setCount} set{setCount === 1 ? '' : 's'}
                </Text>
              );
            })}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  error: { color: '#b00020' },
  sessionCard: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#eee', paddingBottom: 12 },
  sessionDate: { fontSize: 16, fontWeight: '600' },
  sessionType: { fontSize: 13, color: '#666', marginBottom: 6 },
  exerciseLine: { fontSize: 14, marginTop: 2 },
});
