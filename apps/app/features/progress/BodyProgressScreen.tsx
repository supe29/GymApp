import type { GymSupabaseClient } from 'api-client';
import { localDateString, type MuscleCoverage } from 'core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BodyModel, type BodyModelHandle, type ModelSide } from 'three-model';

import { DemoModelCredit } from '../../components/ExerciseDemoPanel';
import ThreeErrorBoundary from '../../components/ThreeErrorBoundary';
import { addLocalDays, loadDayCoverage, parseLocalDate, type DayCoverageData } from './bodyProgressData';

export interface BodyProgressScreenProps {
  client: GymSupabaseClient;
  userId: string;
  /** Injected for tests; defaults to the real clock. */
  now?: () => Date;
  /** Bumped by the navigator on focus, to reload after a workout. */
  refreshToken?: number;
}

function formatSets(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}`;
}

/**
 * Text of each muscle's callout on the 3D model, in the list's order
 * (unfinished planned muscles first, which win when the columns are full):
 * the muscle's name with its percent done ("✓" once done) for a planned
 * muscle, or its set count for extra work.
 */
export function modelLabelsFor(muscles: readonly MuscleCoverage[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const m of muscles) {
    if (m.percent !== null) labels[m.key] = `${m.name} ${m.percent >= 100 ? '✓' : `${m.percent}%`}`;
    else if (m.doneSets > 0) labels[m.key] = `${m.name} ${formatSets(m.doneSets)} ${m.doneSets === 1 ? 'set' : 'sets'}`;
  }
  return labels;
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addLocalDays(today, -1)) return 'Yesterday';
  return parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * FR-8.5/AC-20: for one day, how much of the work planned for each muscle
 * has been done and what is left, shown on the 3D body as a heatmap and as
 * a list (the list is also the non-visual fallback, UX-5 style). Every
 * number comes from core's buildDayMuscleCoverage (AI-1).
 */
export default function BodyProgressScreen({ client, userId, now = () => new Date(), refreshToken = 0 }: BodyProgressScreenProps) {
  const today = localDateString(now());
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DayCoverageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [side, setSide] = useState<ModelSide>('front');
  const modelRef = useRef<BodyModelHandle>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadDayCoverage({ client, userId, date }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this day.');
    } finally {
      setLoading(false);
    }
  }, [client, userId, date]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  function toggleSide() {
    const next: ModelSide = side === 'front' ? 'back' : 'front';
    setSide(next);
    modelRef.current?.showSide(next);
  }

  const coverage = data?.date === date ? data.coverage : null;
  const hasPlan = coverage !== null && coverage.overallPercent !== null;
  const modelLabels = useMemo(() => (coverage ? modelLabelsFor(coverage.muscles) : null), [coverage]);
  const label = dayLabel(date, today);

  let headline: string;
  if (!coverage) headline = '';
  else if (hasPlan) headline = `${coverage.overallPercent}% of ${label === 'Today' ? "today's" : 'the'} planned work done`;
  else if (coverage.muscles.length > 0) headline = 'Rest day. Here is what you did.';
  else headline = date === today ? 'Rest day. Nothing planned today.' : 'Rest day. Nothing planned or logged.';

  const targeted = coverage?.muscles.filter((m) => !m.extra) ?? [];
  const extras = coverage?.muscles.filter((m) => m.extra) ?? [];
  const remaining = targeted.filter((m) => m.remainingSets > 0);

  return (
    <ScrollView style={styles.container} testID="body-progress-screen">
      <View style={styles.dateRow}>
        <Pressable
          testID="body-progress-prev-day"
          onPress={() => setDate((d) => addLocalDays(d, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          style={styles.dateButton}
        >
          <Text style={styles.dateArrow}>‹</Text>
        </Pressable>
        <Text testID="body-progress-date" style={styles.dateLabel}>
          {label}
        </Text>
        <Pressable
          testID="body-progress-next-day"
          onPress={() => setDate((d) => (d < today ? addLocalDays(d, 1) : d))}
          disabled={date >= today}
          accessibilityRole="button"
          accessibilityLabel="Next day"
          accessibilityState={{ disabled: date >= today }}
          style={[styles.dateButton, date >= today && styles.disabled]}
        >
          <Text style={styles.dateArrow}>›</Text>
        </Pressable>
      </View>

      {error ? (
        <Text testID="body-progress-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {loading && !coverage ? <Text testID="body-progress-loading">Loading...</Text> : null}

      {coverage ? (
        <>
          <Text testID="body-progress-headline" style={styles.headline}>
            {headline}
          </Text>
          {data && data.plannedSessionNames.length > 0 ? (
            <Text style={styles.subtle}>{`Plan: ${data.plannedSessionNames.join(' + ')}`}</Text>
          ) : null}
          {hasPlan ? (
            <View
              style={styles.overallTrack}
              accessible
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: coverage.overallPercent ?? 0 }}
            >
              <View style={[styles.overallFill, { width: `${coverage.overallPercent ?? 0}%` }]} />
            </View>
          ) : null}

          {coverage.muscles.length > 0 ? (
            <>
              <View style={styles.body}>
                <ThreeErrorBoundary label="BodyProgress" fallback={() => null}>
                  <BodyModel
                    ref={modelRef}
                    regionIntensity={coverage.regionIntensity}
                    regionLabels={modelLabels}
                    onSelectionChange={setSelectedKey}
                  />
                </ThreeErrorBoundary>
              </View>
              <View style={styles.modelControls}>
                <Pressable testID="body-progress-flip" onPress={toggleSide} accessibilityRole="button" style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>{side === 'front' ? 'Show back' : 'Show front'}</Text>
                </Pressable>
                <View style={styles.legend}>
                  <View style={[styles.legendSwatch, styles.legendLow]} />
                  <Text style={styles.subtle}>started</Text>
                  <View style={[styles.legendSwatch, styles.legendHigh]} />
                  <Text style={styles.subtle}>{hasPlan ? 'target done' : 'most worked'}</Text>
                </View>
              </View>
            </>
          ) : null}

          {targeted.length > 0 ? (
            <View testID="body-progress-targeted">
              <Text style={styles.sectionTitle}>
                {remaining.length > 0 ? `Left to do: ${remaining.length} ${remaining.length === 1 ? 'muscle' : 'muscles'}` : 'Every target done'}
              </Text>
              {targeted.map((m) => (
                <MuscleRow key={m.key} muscle={m} selected={m.key === selectedKey} />
              ))}
            </View>
          ) : null}

          {extras.length > 0 ? (
            <View testID="body-progress-extras">
              <Text style={styles.sectionTitle}>{hasPlan ? 'Also worked' : 'Worked'}</Text>
              {extras.map((m) => (
                <MuscleRow key={m.key} muscle={m} selected={m.key === selectedKey} maxDone={Math.max(...extras.map((e) => e.doneSets))} />
              ))}
            </View>
          ) : null}

          <Text style={styles.footnote}>
            Sets count once for each muscle an exercise mainly works and half for muscles that help.
          </Text>
          {coverage.muscles.length > 0 ? <DemoModelCredit /> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function MuscleRow({ muscle, selected, maxDone }: { muscle: MuscleCoverage; selected: boolean; maxDone?: number }) {
  const fill = muscle.percent !== null ? muscle.percent : maxDone ? (muscle.doneSets / maxDone) * 100 : 0;
  const detail =
    muscle.percent !== null
      ? `${formatSets(muscle.doneSets)} / ${formatSets(muscle.plannedSets)} sets${
          muscle.remainingSets > 0 ? ` · ${formatSets(muscle.remainingSets)} left` : ''
        }`
      : `${formatSets(muscle.doneSets)} ${muscle.doneSets === 1 ? 'set' : 'sets'}`;
  return (
    <View
      testID={`body-progress-muscle-${muscle.key}`}
      style={[styles.muscleRow, selected && styles.muscleRowSelected]}
      accessible
      accessibilityLabel={`${muscle.name}: ${detail}${muscle.percent !== null ? `, ${muscle.percent}%` : ''}`}
    >
      <View style={styles.muscleHeader}>
        <Text style={styles.muscleName}>{muscle.name}</Text>
        {muscle.percent !== null && muscle.percent >= 100 ? <Text style={[styles.badge, styles.badgeDone]}>✓ Done</Text> : null}
        {muscle.percent !== null && muscle.percent < 100 ? <Text style={styles.percent}>{`${muscle.percent}%`}</Text> : null}
      </View>
      <View style={styles.muscleTrack}>
        <View style={[styles.muscleFill, muscle.extra && styles.muscleFillExtra, { width: `${fill}%` }]} />
      </View>
      <Text testID={`body-progress-muscle-${muscle.key}-detail`} style={styles.subtle}>
        {detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  dateButton: { paddingHorizontal: 16, paddingVertical: 6 },
  dateArrow: { fontSize: 24, fontWeight: '600', color: '#111' },
  dateLabel: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.3 },
  error: { color: '#b00020', marginBottom: 12 },
  headline: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  subtle: { fontSize: 12, color: '#666' },
  overallTrack: { height: 10, borderRadius: 5, backgroundColor: '#eee', overflow: 'hidden', marginVertical: 10 },
  overallFill: { height: '100%', backgroundColor: '#e0442f' },
  body: { height: 360, marginVertical: 8 },
  modelControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  smallButton: { borderWidth: 1, borderColor: '#111', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  smallButtonText: { fontSize: 13, fontWeight: '600' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3, marginLeft: 6 },
  legendLow: { backgroundColor: '#d0a7a0' },
  legendHigh: { backgroundColor: '#e0442f' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  muscleRow: { paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#eee', borderRadius: 6 },
  muscleRowSelected: { backgroundColor: '#fdf0e1' },
  muscleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  muscleName: { fontSize: 14, fontWeight: '600' },
  percent: { fontSize: 13, fontWeight: '600', color: '#444' },
  badge: { fontSize: 11, fontWeight: '600', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  badgeDone: { backgroundColor: '#e3f4e6', color: '#1b7a33' },
  muscleTrack: { height: 6, borderRadius: 3, backgroundColor: '#eee', overflow: 'hidden', marginVertical: 4 },
  muscleFill: { height: '100%', backgroundColor: '#e0442f' },
  muscleFillExtra: { backgroundColor: '#f0a33a' },
  footnote: { fontSize: 11, color: '#888', marginTop: 16, marginBottom: 8 },
});
