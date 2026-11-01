import {
  buildNutritionRegenerationPreview,
  buildRegenerationPreview,
  createNutritionTargets,
  createWorkoutPlan,
  getProfile,
  getUserEquipmentIds,
  requestAccountDeletion,
  setUserEquipment,
  updateProfile,
  type EquipmentItemRow,
  type GymSupabaseClient,
  type NutritionRegenerationPreview,
  type RegenerationPreview,
  listEquipmentItems,
} from 'api-client';
import {
  BIOLOGICAL_SEX_OPTIONS,
  type BiologicalSex,
  didNutritionAffectingFieldChange,
  didPlanAffectingFieldChange,
  FITNESS_LEVEL_OPTIONS,
  type FitnessLevel,
  GOAL_OPTIONS,
  type Goal,
  type ProfileInput,
  validateProfileInput,
} from 'core';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getSupabaseClient } from '../../lib/supabaseClient';
import RegeneratePlanPrompt from '../plan/RegeneratePlanPrompt';
import EquipmentChecklist from './EquipmentChecklist';
import { FITNESS_LEVEL_DISPLAY_LABELS, GOAL_DISPLAY_LABELS, SEX_DISPLAY_LABELS } from './profileLabels';

export interface EditProfileScreenProps {
  client?: GymSupabaseClient;
  userId: string;
  onSaved?: () => void;
  /** FR-1.4/FR-2.4: called once the user has accepted a plan regeneration (after it has been persisted). */
  onRegenerateRequested?: () => void;
  /** FR-9.3: called once the deletion request has been accepted by the backend. */
  onAccountDeleted?: () => void;
}

function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/**
 * FR-1.3: edit profile fields after account creation. FR-1.4: editing any
 * plan-affecting field prompts the user to regenerate; declining leaves
 * the existing plan/targets unchanged (AC-3) — this screen only surfaces
 * that prompt and reports the user's choice via onRegenerateRequested,
 * since actual regeneration is implemented in Phases 5/6.
 */
export default function EditProfileScreen({
  client = getSupabaseClient(),
  userId,
  onSaved,
  onRegenerateRequested,
  onAccountDeleted,
}: EditProfileScreenProps) {
  const [loaded, setLoaded] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [original, setOriginal] = useState<ProfileInput | null>(null);
  const [age, setAge] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex>('prefer_not_to_say');
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('beginner');
  const [goal, setGoal] = useState<Goal>('general_fitness');
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState(3);
  const [equipmentItemIds, setEquipmentItemIds] = useState<string[]>([]);
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItemRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [regenerationPreview, setRegenerationPreview] = useState<RegenerationPreview | null>(null);
  const [nutritionRegenerationPreview, setNutritionRegenerationPreview] =
    useState<NutritionRegenerationPreview | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    async function load() {
      const [profileResult, equipmentIdsResult, equipmentItemsResult] = await Promise.all([
        getProfile(client, userId),
        getUserEquipmentIds(client, userId),
        listEquipmentItems(client),
      ]);
      if (equipmentItemsResult.data) {
        setEquipmentItems(equipmentItemsResult.data);
      }
      const ids = equipmentIdsResult.data ?? [];
      setEquipmentItemIds(ids);
      if (profileResult.data) {
        const p = profileResult.data;
        setAge(String(p.age));
        setHeightCm(String(p.height_cm));
        setWeightKg(String(p.weight_kg));
        setBiologicalSex(p.biological_sex);
        setFitnessLevel(p.fitness_level);
        setGoal(p.goal);
        setTrainingDaysPerWeek(p.training_days_per_week);
        setOriginal({
          age: p.age,
          heightCm: p.height_cm,
          weightKg: p.weight_kg,
          biologicalSex: p.biological_sex,
          fitnessLevel: p.fitness_level,
          goal: p.goal,
          trainingDaysPerWeek: p.training_days_per_week,
          equipmentItemIds: ids,
        });
      }
      setLoaded(true);
    }
    load();
  }, [client, userId]);

  async function persist(input: ProfileInput) {
    const updated = await updateProfile(client, userId, {
      age: input.age,
      height_cm: input.heightCm,
      weight_kg: input.weightKg,
      biological_sex: input.biologicalSex,
      fitness_level: input.fitnessLevel,
      goal: input.goal,
      training_days_per_week: input.trainingDaysPerWeek,
    });
    if (updated.error) {
      setError(updated.error);
      return false;
    }
    const equipmentResult = await setUserEquipment(client, userId, input.equipmentItemIds);
    if (equipmentResult.error) {
      setError(equipmentResult.error);
      return false;
    }
    return true;
  }

  async function handleSave() {
    setError(null);
    const nextInput: ProfileInput = {
      age: Number(age),
      heightCm: Number(heightCm),
      weightKg: Number(weightKg),
      biologicalSex,
      fitnessLevel,
      goal,
      trainingDaysPerWeek,
      equipmentItemIds,
    };

    const validation = validateProfileInput(nextInput);
    if (!validation.valid) {
      setError(validation.errors.map((e) => e.message).join(' '));
      return;
    }

    const planAffecting = original ? didPlanAffectingFieldChange(original, nextInput) : false;
    const nutritionAffecting = original ? didNutritionAffectingFieldChange(original, nextInput) : false;

    const persisted = await persist(nextInput);
    if (!persisted) {
      return;
    }

    if (planAffecting || nutritionAffecting) {
      // FR-2.4/Flow 2.7: preview whichever candidate(s) apply (pure, zero
      // writes) and their diff(s) against the current plan/targets
      // *before* asking the user to decide — diff-before-accept, not
      // accept-then-explain. A single combined prompt is shown regardless
      // of whether one or both are affected, per Flow 2.7's "regenerates
      // workout plan and/or nutrition targets" wording.
      const [planPreviewResult, nutritionPreviewResult] = await Promise.all([
        planAffecting ? buildRegenerationPreview(client, userId) : Promise.resolve(null),
        nutritionAffecting ? buildNutritionRegenerationPreview(client, userId) : Promise.resolve(null),
      ]);

      if (planPreviewResult && (planPreviewResult.error || !planPreviewResult.data)) {
        // Degrade gracefully rather than blocking the already-persisted
        // profile save on a preview failure: surface the error and finish
        // the save flow as if regeneration had been declined.
        setError(planPreviewResult.error ?? 'Failed to preview plan regeneration.');
        onSaved?.();
        return;
      }
      if (nutritionPreviewResult && (nutritionPreviewResult.error || !nutritionPreviewResult.data)) {
        setError(nutritionPreviewResult.error ?? 'Failed to preview nutrition target regeneration.');
        onSaved?.();
        return;
      }

      if (planPreviewResult) setRegenerationPreview(planPreviewResult.data);
      if (nutritionPreviewResult) setNutritionRegenerationPreview(nutritionPreviewResult.data);
      return;
    }

    onSaved?.();
  }

  async function handleAcceptRegenerate() {
    if (!regenerationPreview && !nutritionRegenerationPreview) return;
    setAccepting(true);
    const [planResult, nutritionResult] = await Promise.all([
      regenerationPreview ? createWorkoutPlan(client, userId, regenerationPreview.candidatePlan) : null,
      nutritionRegenerationPreview
        ? createNutritionTargets(client, userId, nutritionRegenerationPreview.candidateTargets)
        : null,
    ]);
    setAccepting(false);
    if (planResult?.error) {
      setError(planResult.error);
      return;
    }
    if (nutritionResult?.error) {
      setError(nutritionResult.error);
      return;
    }
    setRegenerationPreview(null);
    setNutritionRegenerationPreview(null);
    onRegenerateRequested?.();
    onSaved?.();
  }

  function handleDeclineRegenerate() {
    // FR-1.4/AC-3: declining leaves the existing plan/targets unchanged —
    // no write call is made for either, and onRegenerateRequested is
    // deliberately NOT called here. The profile edit itself was already
    // persisted above.
    setRegenerationPreview(null);
    setNutritionRegenerationPreview(null);
    onSaved?.();
  }

  /** FR-9.3: request account deletion via the delete-account edge function. */
  async function handleConfirmDeleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    const { error: reqError } = await requestAccountDeletion(client);
    setDeleting(false);
    if (reqError) {
      setDeleteError(reqError);
      return;
    }
    setShowDeleteConfirm(false);
    onAccountDeleted?.();
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="edit-profile-loading">Loading...</Text>
      </View>
    );
  }

  if (regenerationPreview || nutritionRegenerationPreview) {
    return (
      <RegeneratePlanPrompt
        diffSummary={regenerationPreview?.diffSummary}
        nutritionDiffSummary={nutritionRegenerationPreview?.diffSummary}
        onAccept={handleAcceptRegenerate}
        onDecline={handleDeclineRegenerate}
        accepting={accepting}
      />
    );
  }

  if (showDeleteConfirm) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Delete your account?</Text>
        <Text style={styles.body}>
          This permanently deletes your profile, logs, and weight entries. This cannot be undone.
        </Text>
        {deleteError ? (
          <Text testID="delete-account-error" style={styles.error} accessibilityRole="alert">
            {deleteError}
          </Text>
        ) : null}
        <Pressable
          testID="delete-account-confirm"
          style={styles.button}
          disabled={deleting}
          onPress={handleConfirmDeleteAccount}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Delete my account</Text>
        </Pressable>
        <Pressable
          testID="delete-account-cancel"
          style={[styles.button, styles.buttonSecondary]}
          onPress={() => setShowDeleteConfirm(false)}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Age</Text>
      <TextInput
        testID="edit-profile-age"
        style={styles.input}
        keyboardType="number-pad"
        value={age}
        onChangeText={setAge}
        accessibilityLabel="Age"
      />
      <Text style={styles.label}>Height (cm)</Text>
      <TextInput
        testID="edit-profile-height"
        style={styles.input}
        keyboardType="decimal-pad"
        value={heightCm}
        onChangeText={setHeightCm}
        accessibilityLabel="Height in centimeters"
      />
      <Text style={styles.label}>Weight (kg)</Text>
      <TextInput
        testID="edit-profile-weight"
        style={styles.input}
        keyboardType="decimal-pad"
        value={weightKg}
        onChangeText={setWeightKg}
        accessibilityLabel="Weight in kilograms"
      />

      <Text style={styles.label}>Biological sex</Text>
      <View style={styles.chipRow}>
        {BIOLOGICAL_SEX_OPTIONS.map((option) => (
          <Chip
            key={option}
            testID={`edit-profile-sex-${option}`}
            label={SEX_DISPLAY_LABELS[option]}
            selected={biologicalSex === option}
            onPress={() => setBiologicalSex(option)}
          />
        ))}
      </View>

      <Text style={styles.label}>Fitness level</Text>
      <View style={styles.chipRow}>
        {FITNESS_LEVEL_OPTIONS.map((option) => (
          <Chip
            key={option}
            testID={`edit-profile-fitness-${option}`}
            label={FITNESS_LEVEL_DISPLAY_LABELS[option]}
            selected={fitnessLevel === option}
            onPress={() => setFitnessLevel(option)}
          />
        ))}
      </View>

      <Text style={styles.label}>Goal</Text>
      <View style={styles.chipRow}>
        {GOAL_OPTIONS.map((option) => (
          <Chip
            key={option}
            testID={`edit-profile-goal-${option}`}
            label={GOAL_DISPLAY_LABELS[option]}
            selected={goal === option}
            onPress={() => setGoal(option)}
          />
        ))}
      </View>

      <Text style={styles.label}>Training days per week</Text>
      <View style={styles.chipRow}>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <Chip
            key={n}
            testID={`edit-profile-training-days-${n}`}
            label={String(n)}
            selected={trainingDaysPerWeek === n}
            onPress={() => setTrainingDaysPerWeek(n)}
          />
        ))}
      </View>

      <Text style={styles.label}>Equipment</Text>
      <EquipmentChecklist
        items={equipmentItems}
        selectedIds={equipmentItemIds}
        onChange={setEquipmentItemIds}
      />

      {error ? (
        <Text testID="edit-profile-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Pressable testID="edit-profile-save" style={styles.button} onPress={handleSave} accessibilityRole="button">
        <Text style={styles.buttonText}>Save</Text>
      </Pressable>

      <Pressable
        testID="edit-profile-delete-account"
        style={[styles.button, styles.buttonDanger]}
        onPress={() => setShowDeleteConfirm(true)}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Delete account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  body: { fontSize: 15, marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: { backgroundColor: '#111' },
  chipText: { color: '#111', fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonSecondary: { backgroundColor: '#666' },
  buttonDanger: { backgroundColor: '#b00020' },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b00020', marginTop: 12 },
});
