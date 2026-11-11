import {
  buildRegenerationPreview,
  createWorkoutPlan,
  generateInitialPlan,
  getCurrentPlan,
  type GymSupabaseClient,
  type PersistedPlan,
  type RegenerationPreview,
} from 'api-client';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import ExerciseDemoPanel, { DemoModelCredit } from '../../components/ExerciseDemoPanel';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { useExerciseMuscles } from '../exercise-demo/useExerciseMuscles';
import RegeneratePlanPrompt from './RegeneratePlanPrompt';

export interface WorkoutPlanScreenProps {
  client?: GymSupabaseClient;
  userId: string;
  onPlanRegenerated?: () => void;
}

/**
 * FR-2.1/FR-2.2/FR-2.3/FR-2.4/AC-1/AC-2/NFR-7: displays the user's current
 * workout plan, offers on-demand regeneration with a diff preview before
 * committing (FR-2.4/Flow 2.7), and exposes each exercise's generation
 * provenance via a "why" disclosure (NFR-7). Each exercise can also show
 * its movement demo inline, one at a time (each figure is a GL canvas).
 *
 * OQ-5 (missed/skipped session rescheduling) is explicitly out of scope
 * here, same as /docs/decisions/OQ-6-biological-sex.md's citation style
 * for a different open question: this screen has no concept of "today,"
 * "missed," or "skip" — the plan is shown as a static weekly structure.
 */
export default function WorkoutPlanScreen({
  client = getSupabaseClient(),
  userId,
  onPlanRegenerated,
}: WorkoutPlanScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PersistedPlan | null>(null);
  const [preview, setPreview] = useState<RegenerationPreview | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedExerciseIds, setExpandedExerciseIds] = useState<Set<string>>(new Set());
  // Keyed by prescribed-exercise row id: the same exercise can appear in several sessions.
  const [openDemoRowId, setOpenDemoRowId] = useState<string | null>(null);
  const exerciseMuscles = useExerciseMuscles(client);

  useEffect(() => {
    async function load() {
      const result = await getCurrentPlan(client, userId);
      if (result.error) {
        setError(result.error);
      } else {
        setCurrentPlan(result.data);
      }
      setLoaded(true);
    }
    load();
  }, [client, userId]);

  async function handleGenerateInitial() {
    setError(null);
    setGenerating(true);
    const result = await generateInitialPlan(client, userId);
    setGenerating(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCurrentPlan(result.data);
    onPlanRegenerated?.();
  }

  async function handleRequestRegenerate() {
    setError(null);
    setPreviewLoading(true);
    const result = await buildRegenerationPreview(client, userId);
    setPreviewLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to build a regeneration preview.');
      return;
    }
    setPreview(result.data);
  }

  async function handleAcceptRegenerate() {
    if (!preview) return;
    setAccepting(true);
    const result = await createWorkoutPlan(client, userId, preview.candidatePlan);
    setAccepting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCurrentPlan(result.data);
    setPreview(null);
    onPlanRegenerated?.();
  }

  function handleDeclineRegenerate() {
    // FR-2.4/AC-3-equivalent for the on-demand path: declining makes no
    // API call at all — the previewed candidate is simply discarded.
    setPreview(null);
  }

  function toggleWhy(exerciseId: string) {
    setExpandedExerciseIds((prev) => {
      const next = new Set(prev);
      if (next.has(exerciseId)) {
        next.delete(exerciseId);
      } else {
        next.add(exerciseId);
      }
      return next;
    });
  }

  function toggleDemo(rowId: string, exerciseId: string) {
    if (openDemoRowId === rowId) {
      setOpenDemoRowId(null);
      return;
    }
    setOpenDemoRowId(rowId);
    exerciseMuscles.request(exerciseId);
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="plan-loading">Loading...</Text>
      </View>
    );
  }

  if (preview) {
    return (
      <RegeneratePlanPrompt
        diffSummary={preview.diffSummary}
        onAccept={handleAcceptRegenerate}
        onDecline={handleDeclineRegenerate}
        accepting={accepting}
      />
    );
  }

  if (!currentPlan) {
    return (
      <View style={styles.container}>
        <Text testID="plan-empty-state" style={styles.title}>
          No workout plan yet
        </Text>
        {error ? (
          <Text testID="plan-error" style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Pressable
          testID="plan-generate-button"
          style={styles.button}
          disabled={generating}
          onPress={handleGenerateInitial}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{generating ? 'Generating…' : 'Generate my plan'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{currentPlan.splitType.replace('_', ' ')}</Text>
      <Text testID="plan-version-badge" style={styles.versionBadge}>
        v{currentPlan.planVersion}
      </Text>

      {error ? (
        <Text testID="plan-error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {currentPlan.sessions.map((session) => (
        <View key={session.id} testID={`plan-session-${session.dayOrder}`} style={styles.session}>
          <Text style={styles.sessionTitle}>{session.name}</Text>
          {session.exercises.map((ex) => (
            <View key={ex.id} testID={`plan-exercise-${ex.exerciseId}`} style={styles.exerciseRow}>
              <Text style={styles.exerciseName}>
                {ex.exerciseName}: {ex.targetSets}×{ex.targetRepsMin}
                {ex.targetRepsMax && ex.targetRepsMax !== ex.targetRepsMin ? `-${ex.targetRepsMax}` : ''}
              </Text>
              <View style={styles.rowLinks}>
                <Pressable
                  testID={`plan-exercise-why-toggle-${ex.exerciseId}`}
                  onPress={() => toggleWhy(ex.exerciseId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Why was ${ex.exerciseName} prescribed?`}
                  accessibilityState={{ expanded: expandedExerciseIds.has(ex.exerciseId) }}
                >
                  <Text style={styles.whyLink}>Why?</Text>
                </Pressable>
                <Pressable
                  testID={`plan-exercise-demo-toggle-${ex.exerciseId}`}
                  onPress={() => toggleDemo(ex.id, ex.exerciseId)}
                  accessibilityRole="button"
                  accessibilityLabel={`${openDemoRowId === ex.id ? 'Hide' : 'Show'} how to do ${ex.exerciseName}`}
                  accessibilityState={{ expanded: openDemoRowId === ex.id }}
                >
                  <Text style={styles.whyLink}>{openDemoRowId === ex.id ? 'Hide demo' : 'Show demo'}</Text>
                </Pressable>
              </View>
              {expandedExerciseIds.has(ex.exerciseId) ? (
                <Text testID={`plan-exercise-why-${ex.exerciseId}`} style={styles.whyText}>
                  {ex.intensityNote}
                </Text>
              ) : null}
              {openDemoRowId === ex.id ? (
                <ExerciseDemoPanel
                  exerciseName={ex.exerciseName}
                  muscles={exerciseMuscles.musclesFor(ex.exerciseId)}
                  testID={`plan-exercise-demo-${ex.exerciseId}`}
                />
              ) : null}
            </View>
          ))}
        </View>
      ))}

      <Pressable
        testID="plan-regenerate-button"
        style={styles.button}
        disabled={previewLoading}
        onPress={handleRequestRegenerate}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{previewLoading ? 'Checking…' : 'Regenerate plan'}</Text>
      </Pressable>
      {openDemoRowId ? <DemoModelCredit /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  content: { paddingBottom: 48 },
  rowLinks: { flexDirection: 'row', gap: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 4, textTransform: 'capitalize' },
  versionBadge: { fontSize: 13, color: '#666', marginBottom: 16 },
  session: { marginBottom: 20 },
  sessionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  exerciseRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  exerciseName: { fontSize: 14 },
  whyLink: { fontSize: 12, color: '#555', marginTop: 2 },
  whyText: { fontSize: 12, color: '#666', marginTop: 4 },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b00020', marginTop: 12 },
});
