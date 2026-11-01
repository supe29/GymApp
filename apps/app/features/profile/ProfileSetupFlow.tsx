import { createProfile, setUserEquipment, type EquipmentItemRow, type GymSupabaseClient, listEquipmentItems } from 'api-client';
import {
  BIOLOGICAL_SEX_OPTIONS,
  type BiologicalSex,
  FITNESS_LEVEL_OPTIONS,
  type FitnessLevel,
  GOAL_OPTIONS,
  type Goal,
  validateProfileInput,
} from 'core';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import DisclaimerScreen from '../legal/DisclaimerScreen';
import EquipmentChecklist from './EquipmentChecklist';
import { FITNESS_LEVEL_DISPLAY_LABELS, GOAL_DISPLAY_LABELS, SEX_DISPLAY_LABELS } from './profileLabels';
import OnboardingProgressIndicator from './OnboardingProgressIndicator';
import { getSupabaseClient } from '../../lib/supabaseClient';

export interface ProfileSetupFlowProps {
  client?: GymSupabaseClient;
  userId: string;
  onComplete?: () => void;
  /**
   * AC-1: fired once the profile and equipment have been persisted,
   * alongside onComplete. This screen deliberately has no dependency on
   * plan generation itself (generateInitialPlan lives in packages/api-client,
   * built in Phase 5) — wiring this callback to it is left to whatever
   * composes ProfileSetupFlow, since no real navigation layer exists yet
   * (Phase 11).
   */
  onProfileCreated?: (userId: string) => void;
}

interface Draft {
  age: string;
  heightCm: string;
  weightKg: string;
  biologicalSex: BiologicalSex | null;
  fitnessLevel: FitnessLevel | null;
  goal: Goal | null;
  trainingDaysPerWeek: number | null;
  equipmentItemIds: string[];
}

const STEP_LABELS = ['Basic info', 'Fitness level', 'Goal', 'Training days', 'Equipment', 'Disclaimer'];

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
 * FR-1.1/FR-1.2/SR-5/AC-14: the guided onboarding flow — basic info,
 * fitness level, goal, training days, equipment, then the mandatory
 * disclaimer acknowledgment before the profile is created.
 */
export default function ProfileSetupFlow({
  client = getSupabaseClient(),
  userId,
  onComplete,
  onProfileCreated,
}: ProfileSetupFlowProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    age: '',
    heightCm: '',
    weightKg: '',
    biologicalSex: null,
    fitnessLevel: null,
    goal: null,
    trainingDaysPerWeek: null,
    equipmentItemIds: [],
  });
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItemRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listEquipmentItems(client).then((result) => {
      if (result.data) {
        setEquipmentItems(result.data);
      }
    });
  }, [client]);

  function goNext() {
    setError(null);
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleAcknowledgeDisclaimer() {
    setError(null);
    const parsed = {
      age: Number(draft.age),
      heightCm: Number(draft.heightCm),
      weightKg: Number(draft.weightKg),
      biologicalSex: draft.biologicalSex ?? ('prefer_not_to_say' as BiologicalSex),
      fitnessLevel: draft.fitnessLevel ?? ('beginner' as FitnessLevel),
      goal: draft.goal ?? ('general_fitness' as Goal),
      trainingDaysPerWeek: draft.trainingDaysPerWeek ?? 0,
      equipmentItemIds: draft.equipmentItemIds,
    };

    const validation = validateProfileInput(parsed);
    if (!validation.valid) {
      setError(validation.errors.map((e) => e.message).join(' '));
      return;
    }

    setSubmitting(true);
    const created = await createProfile(client, {
      user_id: userId,
      age: parsed.age,
      height_cm: parsed.heightCm,
      weight_kg: parsed.weightKg,
      biological_sex: parsed.biologicalSex,
      fitness_level: parsed.fitnessLevel,
      goal: parsed.goal,
      training_days_per_week: parsed.trainingDaysPerWeek,
    });
    if (created.error) {
      setSubmitting(false);
      setError(created.error);
      return;
    }

    const equipmentResult = await setUserEquipment(client, userId, parsed.equipmentItemIds);
    setSubmitting(false);
    if (equipmentResult.error) {
      setError(equipmentResult.error);
      return;
    }

    onProfileCreated?.(userId);
    onComplete?.();
  }

  return (
    <View style={styles.container}>
      <OnboardingProgressIndicator
        step={step + 1}
        total={STEP_LABELS.length}
        label={STEP_LABELS[step]}
      />

      {error ? (
        <Text testID="onboarding-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      {step === 0 ? (
        <View>
          <Text style={styles.label}>Age</Text>
          <TextInput
            testID="onboarding-age"
            style={styles.input}
            keyboardType="number-pad"
            value={draft.age}
            onChangeText={(age) => setDraft((d) => ({ ...d, age }))}
            accessibilityLabel="Age"
          />
          <Text style={styles.label}>Height (cm)</Text>
          <TextInput
            testID="onboarding-height"
            style={styles.input}
            keyboardType="decimal-pad"
            value={draft.heightCm}
            onChangeText={(heightCm) => setDraft((d) => ({ ...d, heightCm }))}
            accessibilityLabel="Height in centimeters"
          />
          <Text style={styles.label}>Weight (kg)</Text>
          <TextInput
            testID="onboarding-weight"
            style={styles.input}
            keyboardType="decimal-pad"
            value={draft.weightKg}
            onChangeText={(weightKg) => setDraft((d) => ({ ...d, weightKg }))}
            accessibilityLabel="Weight in kilograms"
          />
          <Text style={styles.label}>Biological sex</Text>
          <View style={styles.chipRow}>
            {BIOLOGICAL_SEX_OPTIONS.map((option) => (
              <Chip
                key={option}
                testID={`onboarding-sex-${option}`}
                label={SEX_DISPLAY_LABELS[option]}
                selected={draft.biologicalSex === option}
                onPress={() => setDraft((d) => ({ ...d, biologicalSex: option }))}
              />
            ))}
          </View>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={styles.chipRow}>
          {FITNESS_LEVEL_OPTIONS.map((option) => (
            <Chip
              key={option}
              testID={`onboarding-fitness-${option}`}
              label={FITNESS_LEVEL_DISPLAY_LABELS[option]}
              selected={draft.fitnessLevel === option}
              onPress={() => setDraft((d) => ({ ...d, fitnessLevel: option }))}
            />
          ))}
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.chipRow}>
          {GOAL_OPTIONS.map((option) => (
            <Chip
              key={option}
              testID={`onboarding-goal-${option}`}
              label={GOAL_DISPLAY_LABELS[option]}
              selected={draft.goal === option}
              onPress={() => setDraft((d) => ({ ...d, goal: option }))}
            />
          ))}
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.chipRow}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <Chip
              key={n}
              testID={`onboarding-training-days-${n}`}
              label={String(n)}
              selected={draft.trainingDaysPerWeek === n}
              onPress={() => setDraft((d) => ({ ...d, trainingDaysPerWeek: n }))}
            />
          ))}
        </View>
      ) : null}

      {step === 4 ? (
        <EquipmentChecklist
          items={equipmentItems}
          selectedIds={draft.equipmentItemIds}
          onChange={(equipmentItemIds) => setDraft((d) => ({ ...d, equipmentItemIds }))}
        />
      ) : null}

      {step === 5 ? (
        <DisclaimerScreen onAcknowledge={handleAcknowledgeDisclaimer} />
      ) : (
        <View style={styles.navRow}>
          {step > 0 ? (
            <Pressable testID="onboarding-back" style={styles.navButton} onPress={goBack} accessibilityRole="button">
              <Text style={styles.navButtonText}>Back</Text>
            </Pressable>
          ) : null}
          <Pressable
            testID="onboarding-next"
            style={styles.navButton}
            disabled={submitting}
            onPress={goNext}
            accessibilityRole="button"
          >
            <Text style={styles.navButtonText}>Next</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
  },
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
  navRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  navButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  navButtonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b00020', marginBottom: 12 },
});
