// Phase 6: BMR (Mifflin-St Jeor) and TDEE calculation (spec.md FR-3.1).
// Pure, deterministic.

import type { BiologicalSex } from '../validation/profileValidation';

export interface BmrInput {
  age: number;
  heightCm: number;
  weightKg: number;
  biologicalSex: BiologicalSex;
}

/**
 * Mifflin-St Jeor sex-constant term. `prefer_not_to_say` uses the
 * arithmetic mean of the male/female terms — this exact resolution is
 * specified by spec.md's OQ-6 note, not a new Phase 6 decision.
 */
export const SEX_CONSTANTS: Record<BiologicalSex, number> = {
  male: 5,
  female: -161,
  prefer_not_to_say: -78,
};

/** FR-3.1: Mifflin-St Jeor basal metabolic rate, in kcal/day. */
export function calculateBmr(input: BmrInput): number {
  const { age, heightCm, weightKg, biologicalSex } = input;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + SEX_CONSTANTS[biologicalSex];
}

export interface ActivityMultiplierRule {
  minDays: number;
  maxDays: number;
  multiplier: number;
}

/**
 * Keyed off trainingDaysPerWeek (the actual activity-volume signal), not
 * fitnessLevel (experience level is not the same thing as how often
 * someone trains). Standard Harris-Benedict-family multiplier bands.
 */
export const ACTIVITY_MULTIPLIERS: ActivityMultiplierRule[] = [
  { minDays: 1, maxDays: 2, multiplier: 1.2 },
  { minDays: 3, maxDays: 4, multiplier: 1.55 },
  { minDays: 5, maxDays: 6, multiplier: 1.725 },
  { minDays: 7, maxDays: 7, multiplier: 1.9 },
];

/** FR-3.1: the activity multiplier for a given training frequency. */
export function getActivityMultiplier(trainingDaysPerWeek: number): number {
  const rule = ACTIVITY_MULTIPLIERS.find(
    (r) => trainingDaysPerWeek >= r.minDays && trainingDaysPerWeek <= r.maxDays,
  );
  if (!rule) {
    throw new Error(`No activity multiplier rule for trainingDaysPerWeek=${trainingDaysPerWeek}.`);
  }
  return rule.multiplier;
}

/** FR-3.1: total daily energy expenditure, in kcal/day. */
export function calculateTdee(bmr: number, trainingDaysPerWeek: number): number {
  return bmr * getActivityMultiplier(trainingDaysPerWeek);
}
