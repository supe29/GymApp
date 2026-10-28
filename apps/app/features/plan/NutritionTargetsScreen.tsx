import {
  buildNutritionRegenerationPreview,
  createNutritionTargets,
  generateInitialNutritionTargets,
  getCurrentNutritionTargets,
  type GymSupabaseClient,
  type NutritionRegenerationPreview,
  type PersistedNutritionTargets,
} from 'api-client';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getSupabaseClient } from '../../lib/supabaseClient';
import RegeneratePlanPrompt from './RegeneratePlanPrompt';

export interface NutritionTargetsScreenProps {
  client?: GymSupabaseClient;
  userId: string;
  onTargetsRegenerated?: () => void;
}

/**
 * FR-3.1/FR-3.2/FR-3.3/FR-2.4/AC-1/NFR-7: displays the user's current
 * daily calorie/macro targets, offers on-demand regeneration with a diff
 * preview before committing (FR-2.4/Flow 2.7, nutrition-only mode of the
 * shared RegeneratePlanPrompt), and surfaces SR-2's unsafe-configuration
 * warning when the candidate at preview time warranted one. The warning
 * is advisory-only (per OQ-8's resolution — see
 * /docs/decisions/OQ-1-safe-calorie-floor.md) and is never persisted (the
 * DB schema has no column for it), so it is kept in local screen state
 * from the most recent preview/generation rather than re-derived from the
 * stored row.
 */
export default function NutritionTargetsScreen({
  client = getSupabaseClient(),
  userId,
  onTargetsRegenerated,
}: NutritionTargetsScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [currentTargets, setCurrentTargets] = useState<PersistedNutritionTargets | null>(null);
  const [preview, setPreview] = useState<NutritionRegenerationPreview | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const result = await getCurrentNutritionTargets(client, userId);
      if (result.error) {
        setError(result.error);
      } else {
        setCurrentTargets(result.data);
      }
      setLoaded(true);
    }
    load();
  }, [client, userId]);

  async function handleGenerateInitial() {
    setError(null);
    setGenerating(true);
    const result = await generateInitialNutritionTargets(client, userId);
    setGenerating(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCurrentTargets(result.data);
    onTargetsRegenerated?.();
  }

  async function handleRequestRegenerate() {
    setError(null);
    setPreviewLoading(true);
    const result = await buildNutritionRegenerationPreview(client, userId);
    setPreviewLoading(false);
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to build a regeneration preview.');
      return;
    }
    setPreview(result.data);
    setWarningBanner(result.data.candidateTargets.unsafeConfigurationWarning);
  }

  async function handleAcceptRegenerate() {
    if (!preview) return;
    setAccepting(true);
    const result = await createNutritionTargets(client, userId, preview.candidateTargets);
    setAccepting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCurrentTargets(result.data);
    setPreview(null);
    onTargetsRegenerated?.();
  }

  function handleDeclineRegenerate() {
    // FR-2.4/AC-3-equivalent for the on-demand path: declining makes no
    // API call at all — the previewed candidate is simply discarded.
    setPreview(null);
    setWarningBanner(null);
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="nutrition-loading">Loading...</Text>
      </View>
    );
  }

  if (preview) {
    return (
      <View style={styles.container}>
        {warningBanner ? (
          <Text testID="nutrition-unsafe-warning" style={styles.warning}>
            {warningBanner}
          </Text>
        ) : null}
        <RegeneratePlanPrompt
          nutritionDiffSummary={preview.diffSummary}
          onAccept={handleAcceptRegenerate}
          onDecline={handleDeclineRegenerate}
          accepting={accepting}
        />
      </View>
    );
  }

  if (!currentTargets) {
    return (
      <View style={styles.container}>
        <Text testID="nutrition-empty-state" style={styles.title}>
          No nutrition targets yet
        </Text>
        {error ? (
          <Text testID="nutrition-error" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Pressable
          testID="nutrition-generate-button"
          style={styles.button}
          disabled={generating}
          onPress={handleGenerateInitial}
        >
          <Text style={styles.buttonText}>{generating ? 'Generating…' : 'Generate my targets'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daily targets</Text>
      <Text testID="nutrition-version-badge" style={styles.versionBadge}>
        v{currentTargets.targetVersion}
      </Text>

      {error ? (
        <Text testID="nutrition-error" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {warningBanner ? (
        <Text testID="nutrition-unsafe-warning" style={styles.warning}>
          {warningBanner}
        </Text>
      ) : null}

      <View testID="nutrition-targets-calories" style={styles.row}>
        <Text style={styles.label}>Calories</Text>
        <Text style={styles.value}>{currentTargets.dailyCalories} kcal</Text>
      </View>
      <View testID="nutrition-targets-protein" style={styles.row}>
        <Text style={styles.label}>Protein</Text>
        <Text style={styles.value}>{currentTargets.proteinG} g</Text>
      </View>
      <View testID="nutrition-targets-carbs" style={styles.row}>
        <Text style={styles.label}>Carbs</Text>
        <Text style={styles.value}>{currentTargets.carbsG} g</Text>
      </View>
      <View testID="nutrition-targets-fat" style={styles.row}>
        <Text style={styles.label}>Fat</Text>
        <Text style={styles.value}>{currentTargets.fatG} g</Text>
      </View>

      <Pressable
        testID="nutrition-regenerate-button"
        style={styles.button}
        disabled={previewLoading}
        onPress={handleRequestRegenerate}
      >
        <Text style={styles.buttonText}>{previewLoading ? 'Checking…' : 'Regenerate targets'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 4 },
  versionBadge: { fontSize: 13, color: '#666', marginBottom: 16 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: { fontSize: 14, fontWeight: '600' },
  value: { fontSize: 14 },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b00020', marginTop: 12 },
  warning: { color: '#8a5a00', backgroundColor: '#fff3cd', padding: 10, borderRadius: 6, marginTop: 12 },
});
