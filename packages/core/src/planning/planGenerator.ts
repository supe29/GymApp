// Phase 5: top-level deterministic plan generator (spec.md FR-2.1, FR-2.2,
// FR-2.3, SR-3, SR-6, NFR-7). Pure, synchronous — takes a fully-formed
// profile/equipment/exercise-library snapshot in, returns a complete
// in-memory plan structure out. No I/O, no randomness, no wall-clock
// dependency: generatePlan(x) always equals generatePlan(x) for any x,
// regardless of the input exercise library's array order.

import { filterByEquipmentSubset, filterByMuscleGroup, type ExerciseWithTags } from '../content/exerciseQueries';
import type { FitnessLevel, Goal } from '../validation/profileValidation';
import { type GatingResult, selectExerciseForSlot } from './rules/difficultyGating';
import { getPrescription } from './rules/prescriptionRules';
import { getExercisesPerSession } from './rules/sessionComposition';
import type { SplitType } from './rules/splitRules';
import { selectSplit } from './splitSelector';

export interface PlanGeneratorInput {
  goal: Goal;
  fitnessLevel: FitnessLevel;
  trainingDaysPerWeek: number;
  availableEquipmentKeys: string[];
  exerciseLibrary: ExerciseWithTags[];
}

export interface ExercisePrescriptionProvenance {
  splitRuleId: string;
  /** `${goal}:${fitnessLevel}` — the PRESCRIPTION_RULES key that produced sets/reps. */
  prescriptionRuleKey: string;
  /** `${splitType}:${fitnessLevel}` — the SESSION_COMPOSITION_RULES key that sized this session. */
  sessionCompositionKey: string;
  muscleGroupTargeted: string;
  difficultyGate: GatingResult;
}

export interface GeneratedPrescribedExercise {
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  /** Always null at generation time (NFR-7/AI-1: no number is invented without logged history to base it on). */
  targetWeightKg: null;
  /** Qualitative guidance plus an appended NFR-7 provenance trailer. */
  intensityNote: string;
  provenance: ExercisePrescriptionProvenance;
}

export interface GeneratedSession {
  dayOrder: number;
  name: string;
  exercises: GeneratedPrescribedExercise[];
}

export interface GeneratedPlan {
  splitType: SplitType;
  splitRuleId: string;
  sessions: GeneratedSession[];
  inputsSnapshot: {
    goal: Goal;
    fitnessLevel: FitnessLevel;
    trainingDaysPerWeek: number;
    /** Sorted, for stable diffing/comparison. */
    availableEquipmentKeys: string[];
  };
}

function rankCandidates(candidates: ExerciseWithTags[], muscleGroupKey: string): ExerciseWithTags[] {
  return [...candidates].sort((a, b) => {
    const aPrimary = a.primaryMuscleKeys.includes(muscleGroupKey) ? 0 : 1;
    const bPrimary = b.primaryMuscleKeys.includes(muscleGroupKey) ? 0 : 1;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;
    return a.id.localeCompare(b.id);
  });
}

function equipmentKind(exercise: ExerciseWithTags): 'bodyweight' | 'loaded' {
  return exercise.requiredEquipmentKeys.length === 0 ? 'bodyweight' : 'loaded';
}

function buildIntensityNote(
  template: string,
  exercise: ExerciseWithTags,
  goal: Goal,
  fitnessLevel: FitnessLevel,
  splitRuleId: string,
  gate: GatingResult,
): string {
  const guidance = template.replace('{equipmentKind}', equipmentKind(exercise));
  const parts = [`goal=${goal}`, `level=${fitnessLevel}`, `split-rule=${splitRuleId}`, `prescription-rule=${goal}:${fitnessLevel}`];
  if (gate.gateApplied && !gate.usedAdvancedFallback) {
    parts.push('beginner-safety substitution applied');
  } else if (gate.usedAdvancedFallback) {
    parts.push('no safer alternative available for this slot; advanced-level exercise prescribed to a beginner profile');
  }
  return `${guidance} (Generated from ${parts.join(', ')})`;
}

/**
 * FR-2.1/FR-2.2/FR-2.3/SR-3/SR-6/NFR-7: generate a complete workout plan
 * from profile + equipment + exercise-library inputs.
 */
export function generatePlan(input: PlanGeneratorInput): GeneratedPlan {
  const { goal, fitnessLevel, trainingDaysPerWeek, availableEquipmentKeys, exerciseLibrary } = input;
  const { splitType, sessionTemplates, splitRuleId } = selectSplit({
    goal,
    fitnessLevel,
    trainingDaysPerWeek,
  });
  const exercisesPerSession = getExercisesPerSession(splitType, fitnessLevel);
  const prescription = getPrescription(goal, fitnessLevel);
  const sessionCompositionKey = `${splitType}:${fitnessLevel}`;
  const prescriptionRuleKey = `${goal}:${fitnessLevel}`;

  const sessions: GeneratedSession[] = sessionTemplates.map((template) => {
    const usedExerciseIds = new Set<string>();
    const exercises: GeneratedPrescribedExercise[] = [];

    for (let slot = 0; slot < exercisesPerSession; slot += 1) {
      const muscleGroupKey = template.muscleGroupKeys[slot % template.muscleGroupKeys.length];

      // FR-2.2/SR-6: filterByEquipmentSubset is the single enforcement
      // point for "never prescribe equipment the user hasn't declared" —
      // reused verbatim from Phase 3, never reimplemented here.
      const candidates = filterByEquipmentSubset(
        filterByMuscleGroup(exerciseLibrary, muscleGroupKey),
        availableEquipmentKeys,
      ).filter((e) => !usedExerciseIds.has(e.id));

      const ranked = rankCandidates(candidates, muscleGroupKey);
      const gated = selectExerciseForSlot(ranked, fitnessLevel);

      // No compatible exercise exists for this muscle/equipment slot — a
      // Phase 3 content-coverage limitation, not a constraint violation.
      // Skip the slot rather than inserting anything non-compliant.
      if (gated === null) {
        continue;
      }

      usedExerciseIds.add(gated.exercise.id);
      exercises.push({
        exerciseId: gated.exercise.id,
        exerciseName: gated.exercise.name,
        orderIndex: exercises.length,
        targetSets: prescription.targetSets,
        targetRepsMin: prescription.targetRepsMin,
        targetRepsMax: prescription.targetRepsMax,
        targetWeightKg: null,
        intensityNote: buildIntensityNote(
          prescription.intensityNoteTemplate,
          gated.exercise,
          goal,
          fitnessLevel,
          splitRuleId,
          gated,
        ),
        provenance: {
          splitRuleId,
          prescriptionRuleKey,
          sessionCompositionKey,
          muscleGroupTargeted: muscleGroupKey,
          difficultyGate: gated,
        },
      });
    }

    return { dayOrder: template.dayOrder, name: template.name, exercises };
  });

  return {
    splitType,
    splitRuleId,
    sessions,
    inputsSnapshot: {
      goal,
      fitnessLevel,
      trainingDaysPerWeek,
      availableEquipmentKeys: [...availableEquipmentKeys].sort(),
    },
  };
}
