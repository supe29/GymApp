import { getSessionInsights, type GymSupabaseClient } from 'api-client';
import { formatWeight, type SessionAiFacts, type SessionSummary as SessionSummaryData, type SummaryText, type UnitPreference } from 'core';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BodyModel } from 'three-model';

import { DemoModelCredit } from '../../components/ExerciseDemoPanel';
import ThreeErrorBoundary from '../../components/ThreeErrorBoundary';

export interface SessionSummaryProps {
  client: GymSupabaseClient;
  summary: SessionSummaryData;
  aiFacts: SessionAiFacts;
  unitPreference: UnitPreference;
  /** New-PR cards, rendered under "New personal records". */
  prSection?: ReactNode;
  /** Progression suggestion cards (accept/decline), rendered under "Next session". */
  progressionSection?: ReactNode;
  onDone: () => void;
  testID?: string;
  doneTestID?: string;
}

type AiState = { status: 'loading' } | { status: 'ready'; text: SummaryText } | { status: 'fallback' };

function signedWeight(kg: number, unit: UnitPreference): string {
  return `${kg > 0 ? '+' : '−'}${formatWeight(Math.abs(kg), unit)}`;
}

function Section({ title, children, testID }: { title: string; children: ReactNode; testID?: string }) {
  return (
    <View style={styles.section} testID={testID}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * FR-8.4: the summary shown after every completed session. Facts (numbers,
 * exercises, muscles, goal fit, next session) come from core's
 * buildSessionSummary. The explanatory paragraphs come from the
 * session-insights AI function, labelled as AI (AI-4) with a not-medical-
 * advice line (AI-3/SR-5); until it answers, or if it can't, the
 * rule-based wording from the same facts is shown without the AI label.
 */
export default function SessionSummary({
  client,
  summary,
  aiFacts,
  unitPreference,
  prSection,
  progressionSection,
  onDone,
  testID = 'session-suggestions-review',
  doneTestID = 'session-suggestions-done',
}: SessionSummaryProps) {
  const [ai, setAi] = useState<AiState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => getSessionInsights(client, aiFacts))
      .then((result) => {
        if (!cancelled) setAi(result.data ? { status: 'ready', text: result.data } : { status: 'fallback' });
      })
      .catch(() => {
        if (!cancelled) setAi({ status: 'fallback' });
      });
    return () => {
      cancelled = true;
    };
  }, [client, aiFacts]);

  const text = ai.status === 'ready' ? ai.text : summary.fallbackText;
  const isAi = ai.status === 'ready';
  const { totals } = summary;
  const doneExercises = summary.exercises.filter((ex) => !ex.skipped);
  const skippedExercises = summary.exercises.filter((ex) => ex.skipped);
  const topMuscles = summary.musclesWorked.slice(0, 6);
  const maxWeighted = topMuscles[0]?.weightedSets ?? 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} testID={testID}>
      <Text style={styles.kicker}>Session complete</Text>
      <Text testID="session-summary-headline" style={styles.title}>
        {text.headline}
      </Text>

      <View style={styles.statsRow} testID="session-summary-totals">
        <Stat label="Sets" value={String(totals.sets)} />
        <Stat label="Reps" value={String(totals.reps)} />
        {totals.volumeKg > 0 ? <Stat label="Volume" value={formatWeight(totals.volumeKg, unitPreference)} /> : null}
        {summary.durationMinutes !== null ? (
          <Stat label="Time" value={summary.durationMinutes < 1 ? "<1 min" : `${summary.durationMinutes} min`} />
        ) : null}
      </View>
      {totals.volumeChangeKg !== null && totals.volumeChangeKg !== 0 ? (
        <Text testID="session-summary-volume-change" style={[styles.change, totals.volumeChangeKg > 0 ? styles.up : styles.down]}>
          {`${signedWeight(totals.volumeChangeKg, unitPreference)} volume vs last time`}
        </Text>
      ) : null}

      <Section title="What you did" testID="session-summary-exercises">
        <Text style={styles.paragraph}>{text.whatYouDid}</Text>
        {doneExercises.map((ex) => (
          <View key={ex.exerciseId} style={styles.exerciseRow} testID={`session-summary-exercise-${ex.exerciseId}`}>
            <View style={styles.exerciseMain}>
              <Text style={styles.exerciseName}>{ex.name}</Text>
              <Text style={styles.exerciseDetail}>
                {`${ex.setsDone}${ex.targetSets > 0 ? `/${ex.targetSets}` : ''} sets · ${ex.reps.join(', ')} reps${
                  ex.topWeightKg !== null ? ` · top ${formatWeight(ex.topWeightKg, unitPreference)}` : ''
                }`}
              </Text>
            </View>
            <View style={styles.exerciseSide}>
              {ex.targetMet === true ? <Text style={[styles.badge, styles.badgeGood]}>Target met</Text> : null}
              {ex.targetMet === false ? <Text style={[styles.badge, styles.badgeHold]}>Below target</Text> : null}
              {ex.volumeChangeKg !== null && ex.volumeChangeKg !== 0 ? (
                <Text style={[styles.changeSmall, ex.volumeChangeKg > 0 ? styles.up : styles.down]}>
                  {signedWeight(ex.volumeChangeKg, unitPreference)}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
        {skippedExercises.length > 0 ? (
          <Text style={styles.skipped}>{`Skipped: ${skippedExercises.map((ex) => ex.name).join(', ')}`}</Text>
        ) : null}
      </Section>

      {topMuscles.length > 0 ? (
        <Section title="What it worked" testID="session-summary-muscles">
          <View style={styles.body}>
            <ThreeErrorBoundary label="SessionSummary" fallback={() => null}>
              <BodyModel activeExerciseMuscles={summary.bodyHighlight} />
            </ThreeErrorBoundary>
          </View>
          {topMuscles.map((m) => (
            <View key={m.key} style={styles.muscleRow} testID={`session-summary-muscle-${m.key}`}>
              <Text style={styles.muscleName}>{m.name}</Text>
              <View style={styles.muscleTrack}>
                <View style={[styles.muscleFill, { width: `${(m.weightedSets / maxWeighted) * 100}%` }]} />
              </View>
              <Text style={styles.muscleSets}>{`${m.weightedSets} ${m.weightedSets === 1 ? 'set' : 'sets'}`}</Text>
            </View>
          ))}
          <Text style={styles.paragraph}>{text.bodyImpact}</Text>
        </Section>
      ) : null}

      {prSection ? <Section title="New personal records">{prSection}</Section> : null}

      <Section title="Why this helps your goal" testID="session-summary-goal">
        {ai.status === 'loading' ? (
          <Text testID="session-summary-ai-loading" style={styles.loading}>
            Writing your summary…
          </Text>
        ) : null}
        <Text testID="session-summary-goal-text" style={styles.paragraph}>
          {text.goalImpact}
        </Text>
      </Section>

      <Section title="Next session" testID="session-summary-next">
        <Text testID="session-summary-next-text" style={styles.paragraph}>
          {text.nextSession}
        </Text>
        {progressionSection}
      </Section>

      {isAi ? (
        <View testID="session-summary-ai-label" style={styles.aiLabel}>
          <Text style={styles.aiBadge}>AI-generated</Text>
          <Text style={styles.aiNote}>
            Explanations are written by AI from your logged sets. Numbers and suggestions come from your plan&apos;s rules. Not medical
            advice.
          </Text>
        </View>
      ) : null}

      <Pressable testID={doneTestID} style={styles.button} onPress={onDone} accessibilityRole="button">
        <Text style={styles.buttonText}>Done</Text>
      </Pressable>
      {topMuscles.length > 0 ? <DemoModelCredit /> : null}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  content: { paddingBottom: 40 },
  kicker: { fontSize: 12, fontWeight: '700', color: '#2e7d32', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 20, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: '#111', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
  statLabel: { color: '#bbb', fontSize: 11, marginTop: 2 },
  change: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  changeSmall: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  up: { color: '#2e7d32' },
  down: { color: '#b45309' },
  section: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, marginTop: 14 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  paragraph: { fontSize: 14, lineHeight: 20, color: '#222', marginBottom: 6 },
  loading: { fontSize: 12, color: '#777', fontStyle: 'italic', marginBottom: 4 },
  exerciseRow: { flexDirection: 'row', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#e4e4e4' },
  exerciseMain: { flex: 1 },
  exerciseSide: { alignItems: 'flex-end', justifyContent: 'center' },
  exerciseName: { fontSize: 14, fontWeight: '600' },
  exerciseDetail: { fontSize: 12, color: '#555', marginTop: 2 },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  badgeGood: { backgroundColor: '#e3f1e4', color: '#2e7d32' },
  badgeHold: { backgroundColor: '#fdf0e1', color: '#b45309' },
  skipped: { fontSize: 12, color: '#888', marginTop: 6 },
  body: { height: 260, marginBottom: 8 },
  muscleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  muscleName: { width: 100, fontSize: 13 },
  muscleTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#e2e2e2', overflow: 'hidden', marginHorizontal: 8 },
  muscleFill: { height: 8, borderRadius: 4, backgroundColor: '#c62828' },
  muscleSets: { width: 52, fontSize: 12, color: '#555', textAlign: 'right' },
  aiLabel: { marginTop: 14, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#d6d0f0', backgroundColor: '#f6f4fd' },
  aiBadge: { fontSize: 11, fontWeight: '700', color: '#5b4bb7', marginBottom: 4 },
  aiNote: { fontSize: 12, color: '#555', lineHeight: 17 },
  button: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
