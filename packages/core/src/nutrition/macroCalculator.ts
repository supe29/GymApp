// Phase 6: goal-based calorie adjustment and macro split (spec.md FR-3.1).
// Pure, deterministic. All gram values rounded to 1 decimal to match the
// DB's numeric(6,1) columns on nutrition_targets.

import type { Goal } from '../validation/profileValidation';

/** Fractional adjustment applied to TDEE before the SR-1 floor clamp. */
export const GOAL_CALORIE_ADJUSTMENTS: Record<Goal, number> = {
  fat_loss: -0.2,
  muscle_gain: 0.15,
  strength: 0.05,
  general_fitness: 0,
};

export interface CalorieTargetResult {
  /** The goal-adjusted target BEFORE the SR-1 floor clamp — input to the SR-2 unsafe-configuration check. */
  preClampCalories: number;
  /** The final calorie target, SR-1-floor-clamped. */
  dailyCalories: number;
}

/** FR-3.1/SR-1: goal-adjusted calorie target, clamped to the safe-minimum floor. */
export function calculateCalorieTarget(tdee: number, goal: Goal, floor: number): CalorieTargetResult {
  const preClampCalories = Math.round(tdee * (1 + GOAL_CALORIE_ADJUSTMENTS[goal]));
  return { preClampCalories, dailyCalories: Math.max(preClampCalories, floor) };
}

/** Protein target scaled by bodyweight — higher for fat_loss (preserve lean mass) than general_fitness. */
export const PROTEIN_G_PER_KG_BY_GOAL: Record<Goal, number> = {
  fat_loss: 2.0,
  muscle_gain: 1.8,
  strength: 1.8,
  general_fitness: 1.6,
};

const FAT_CALORIE_FRACTION = 0.25;
const KCAL_PER_G_FAT = 9;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;

export interface MacroTargets {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * FR-3.1: macro split derived from the final (floor-clamped) calorie
 * target. Protein is bodyweight-scaled first; fat is a fixed 25% of
 * calories; remaining calories go to carbs. Remaining-calorie math is
 * clamped at 0 — a very low calorie target combined with a high
 * bodyweight-scaled protein requirement can leave no room for carbs,
 * which is a valid (if lean) output, not an error.
 */
export function calculateMacros(dailyCalories: number, goal: Goal, weightKg: number): MacroTargets {
  const proteinG = round1(PROTEIN_G_PER_KG_BY_GOAL[goal] * weightKg);
  const proteinKcal = proteinG * KCAL_PER_G_PROTEIN;
  const fatKcal = dailyCalories * FAT_CALORIE_FRACTION;
  const fatG = round1(fatKcal / KCAL_PER_G_FAT);
  const remainingKcal = Math.max(dailyCalories - proteinKcal - fatKcal, 0);
  const carbsG = round1(remainingKcal / KCAL_PER_G_CARB);
  return { proteinG, carbsG, fatG };
}
