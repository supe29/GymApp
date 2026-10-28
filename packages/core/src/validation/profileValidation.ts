// Deterministic profile-field validation (spec.md FR-1.1). Mirrors the
// CHECK constraints in /supabase/migrations/0001_profiles.sql so invalid
// input is caught client-side with a clear message before it ever reaches
// the database — the DB constraints remain the actual source of truth and
// must be kept in sync with this file if either changes.
//
// biological_sex options reflect OQ-6's resolution — see
// /docs/decisions/OQ-6-biological-sex.md.

export type BiologicalSex = 'male' | 'female' | 'prefer_not_to_say';
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';
export type Goal = 'fat_loss' | 'muscle_gain' | 'strength' | 'general_fitness';

export interface ProfileInput {
  age: number;
  heightCm: number;
  weightKg: number;
  biologicalSex: BiologicalSex;
  fitnessLevel: FitnessLevel;
  goal: Goal;
  trainingDaysPerWeek: number;
  equipmentItemIds: string[];
}

export interface ValidationError {
  field: keyof ProfileInput;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export const BIOLOGICAL_SEX_OPTIONS: readonly BiologicalSex[] = [
  'male',
  'female',
  'prefer_not_to_say',
];
export const FITNESS_LEVEL_OPTIONS: readonly FitnessLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
];
export const GOAL_OPTIONS: readonly Goal[] = [
  'fat_loss',
  'muscle_gain',
  'strength',
  'general_fitness',
];

// Matches supabase/migrations/0001_profiles.sql exactly.
const AGE_MIN = 13;
const AGE_MAX = 120;
const TRAINING_DAYS_MIN = 1;
const TRAINING_DAYS_MAX = 7;

// Sanity bounds beyond the DB's bare `> 0` check, to catch obvious data-
// entry mistakes (e.g. a misplaced decimal or unit-system mix-up) before
// they reach the server. Not a medical or product limit.
const HEIGHT_CM_MIN = 50;
const HEIGHT_CM_MAX = 272;
const WEIGHT_KG_MIN = 20;
const WEIGHT_KG_MAX = 400;

function isInteger(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n);
}

export function validateProfileInput(input: ProfileInput): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isInteger(input.age) || input.age < AGE_MIN || input.age > AGE_MAX) {
    errors.push({
      field: 'age',
      message: `Age must be a whole number between ${AGE_MIN} and ${AGE_MAX}.`,
    });
  }

  if (
    !Number.isFinite(input.heightCm) ||
    input.heightCm < HEIGHT_CM_MIN ||
    input.heightCm > HEIGHT_CM_MAX
  ) {
    errors.push({
      field: 'heightCm',
      message: `Height must be between ${HEIGHT_CM_MIN} and ${HEIGHT_CM_MAX} cm.`,
    });
  }

  if (
    !Number.isFinite(input.weightKg) ||
    input.weightKg < WEIGHT_KG_MIN ||
    input.weightKg > WEIGHT_KG_MAX
  ) {
    errors.push({
      field: 'weightKg',
      message: `Weight must be between ${WEIGHT_KG_MIN} and ${WEIGHT_KG_MAX} kg.`,
    });
  }

  if (!BIOLOGICAL_SEX_OPTIONS.includes(input.biologicalSex)) {
    errors.push({ field: 'biologicalSex', message: 'Select a biological sex option.' });
  }

  if (!FITNESS_LEVEL_OPTIONS.includes(input.fitnessLevel)) {
    errors.push({ field: 'fitnessLevel', message: 'Select a fitness level.' });
  }

  if (!GOAL_OPTIONS.includes(input.goal)) {
    errors.push({ field: 'goal', message: 'Select a goal.' });
  }

  if (
    !isInteger(input.trainingDaysPerWeek) ||
    input.trainingDaysPerWeek < TRAINING_DAYS_MIN ||
    input.trainingDaysPerWeek > TRAINING_DAYS_MAX
  ) {
    errors.push({
      field: 'trainingDaysPerWeek',
      message: `Training days per week must be a whole number between ${TRAINING_DAYS_MIN} and ${TRAINING_DAYS_MAX}.`,
    });
  }

  if (
    !Array.isArray(input.equipmentItemIds) ||
    input.equipmentItemIds.some((id) => typeof id !== 'string' || id.length === 0)
  ) {
    errors.push({ field: 'equipmentItemIds', message: 'Equipment selection is invalid.' });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Profile fields whose change must prompt plan/target regeneration
 * (FR-1.4). Actual regeneration lands in Phases 5/6; this only identifies
 * which fields matter.
 */
export function fieldsAffectingGeneratedPlan(): Array<keyof ProfileInput> {
  return ['weightKg', 'goal', 'equipmentItemIds', 'trainingDaysPerWeek', 'fitnessLevel'];
}

export function didPlanAffectingFieldChange(
  previous: ProfileInput,
  next: ProfileInput,
): boolean {
  for (const field of fieldsAffectingGeneratedPlan()) {
    if (field === 'equipmentItemIds') {
      const a = [...previous.equipmentItemIds].sort();
      const b = [...next.equipmentItemIds].sort();
      if (a.length !== b.length || a.some((value, i) => value !== b[i])) {
        return true;
      }
    } else if (previous[field] !== next[field]) {
      return true;
    }
  }
  return false;
}

/**
 * Profile fields whose change must prompt nutrition-target regeneration
 * (FR-1.4/Phase 6). Distinct from fieldsAffectingGeneratedPlan(): equipment
 * has no bearing on calorie/macro math, and fitnessLevel is not used by
 * the BMR/TDEE formulas (trainingDaysPerWeek is the activity-volume
 * signal those formulas actually consume) — so the two field sets overlap
 * but are not identical.
 */
export function fieldsAffectingNutritionTargets(): Array<keyof ProfileInput> {
  return ['age', 'heightCm', 'weightKg', 'biologicalSex', 'goal', 'trainingDaysPerWeek'];
}

export function didNutritionAffectingFieldChange(
  previous: ProfileInput,
  next: ProfileInput,
): boolean {
  return fieldsAffectingNutritionTargets().some((field) => previous[field] !== next[field]);
}
