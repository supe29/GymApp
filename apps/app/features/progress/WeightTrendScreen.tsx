import { deleteWeightEntry, getProfile, getWeightEntries, logWeightEntry, type GymSupabaseClient, type PersistedWeightEntry } from 'api-client';
import { formatWeight, kgToLb, type UnitPreference } from 'core';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import EmptyState from '../../components/EmptyState';
import LogWeightModal from './LogWeightModal';

export interface WeightTrendScreenProps {
  client: GymSupabaseClient;
  userId: string;
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 140;
const CHART_PADDING = 10;

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

/** FR-8.1/UX-8/AC-12: body weight log with a trend chart, rendered in the user's preferred unit. */
export default function WeightTrendScreen({ client, userId }: WeightTrendScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<PersistedWeightEntry[]>([]);
  const [unitPreference, setUnitPreference] = useState<UnitPreference>('metric');
  const [showLogModal, setShowLogModal] = useState(false);
  const [profileWeightKg, setProfileWeightKg] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [entriesRes, profileRes] = await Promise.all([getWeightEntries(client, userId), getProfile(client, userId)]);
    if (entriesRes.error) {
      setError(entriesRes.error);
    } else {
      setEntries(entriesRes.data ?? []);
    }
    if (profileRes.data) {
      setUnitPreference(profileRes.data.unit_preference);
      setProfileWeightKg(profileRes.data.weight_kg);
    }
    setLoaded(true);
  }, [client, userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleLogWeight(weightKg: number) {
    setShowLogModal(false);
    const result = await logWeightEntry(client, userId, weightKg);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  async function handleDelete(id: string) {
    const result = await deleteWeightEntry(client, userId, id);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="weight-trend-loading">Loading...</Text>
      </View>
    );
  }

  if (showLogModal) {
    return <LogWeightModal
        unitPreference={unitPreference}
        initialWeightKg={entries.length > 0 ? entries[entries.length - 1].weightKg : profileWeightKg}
        onSubmit={handleLogWeight} onCancel={() => setShowLogModal(false)} />;
  }

  const displayWeights = entries.map((e) => (unitPreference === 'imperial' ? kgToLb(e.weightKg) : e.weightKg));
  const min = displayWeights.length > 0 ? Math.min(...displayWeights) : 0;
  const max = displayWeights.length > 0 ? Math.max(...displayWeights) : 0;
  const range = max - min || 1;
  const innerWidth = CHART_WIDTH - CHART_PADDING * 2;
  const innerHeight = CHART_HEIGHT - CHART_PADDING * 2;
  const points = displayWeights.map((w, i) => {
    const x = CHART_PADDING + (displayWeights.length > 1 ? (i / (displayWeights.length - 1)) * innerWidth : innerWidth / 2);
    const y = CHART_PADDING + innerHeight - ((w - min) / range) * innerHeight;
    return { x, y };
  });

  return (
    <ScrollView style={styles.container} testID="weight-trend-screen">
      <Text style={styles.title}>Weight trend</Text>

      {error ? (
        <Text testID="weight-trend-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          testID="weight-trend-empty"
          title="No weight logged yet"
          message="Log your weight to start tracking your trend."
          actionLabel="Log weight"
          onAction={() => setShowLogModal(true)}
        />
      ) : entries.length === 1 ? (
        <Text testID="weight-trend-chart-pending">Log one more weight entry to see a trend chart.</Text>
      ) : (
        // The accessible label lives on a wrapping View: react-native-svg's
        // web Svg forwards `accessible` straight to the DOM as an invalid attribute.
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Weight trend chart. ${entries.length} entries, ranging from ${Math.round(min)} to ${Math.round(max)} ${unitPreference === 'imperial' ? 'lb' : 'kg'}. See the list below for exact values.`}
        >
          <Svg testID="weight-trend-chart" width={CHART_WIDTH} height={CHART_HEIGHT}>
            <Polyline
              testID="weight-trend-chart-line"
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#111"
              strokeWidth={2}
            />
            {points.map((p, i) => (
              <Circle key={entries[i].id} cx={p.x} cy={p.y} r={4} fill="#111" />
            ))}
          </Svg>
        </View>
      )}

      {entries.map((entry) => (
        <View key={entry.id} testID={`weight-entry-${entry.id}`} style={styles.entryRow}>
          <View>
            <Text style={styles.entryValue}>{formatWeight(entry.weightKg, unitPreference)}</Text>
            <Text style={styles.entryDate}>{formatDate(entry.measuredAt)}</Text>
          </View>
          <Pressable
            testID={`weight-entry-${entry.id}-delete`}
            onPress={() => handleDelete(entry.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove weight entry from ${formatDate(entry.measuredAt)}`}
          >
            <Text style={styles.deleteText}>Remove</Text>
          </Pressable>
        </View>
      ))}

      <Pressable testID="weight-trend-log-button" style={styles.logButton} onPress={() => setShowLogModal(true)} accessibilityRole="button">
        <Text style={styles.logButtonText}>Log weight</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
  error: { color: '#b00020', marginBottom: 12 },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  entryValue: { fontSize: 14, fontWeight: '600' },
  entryDate: { fontSize: 12, color: '#666' },
  deleteText: { color: '#b00020', fontSize: 13 },
  logButton: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  logButtonText: { color: '#fff', fontWeight: '600' },
});
