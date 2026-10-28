// Phase 6: top-level deterministic nutrition target generator (spec.md
// FR-3.1/FR-3.2/FR-3.3, SR-1, SR-2, NFR-7). Pure, synchronous — mirrors
// ../planning/planGenerator.ts's role for workout plans.

import {
  calculateBmr,
  calculateTdee,
  getActivityMultiplier,
  type BmrInput,
} from './bmrCalculator';
import { calculateCalorieTarget, calculateMacros, GOAL_CALORIE_ADJUSTMENTS } from './macroCalculator';
import { checkUnsafeConfiguration, getCalorieFloor } from './safetyLimits';
import type { Goal } from '../validation/profileValidation';

export interface NutritionGeneratorInput extends BmrInput {
  goal: Goal;
  trainingDaysPerWeek: number;
}

/** NFR-7: every input that produced this generation, for auditability/explainability. */
export interface NutritionProvenance {
  bmr: number;
  tdee: number;
  activityMultiplier: number;
  goalAdjustmentFraction: number;
  preClampCalories: number;
  calorieFloor: number;
  floorApplied: boolean;
}

export interface GeneratedNutritionTargets {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** SR-2/OQ-8: non-null when this configuration warrants a warning; generation proceeds regardless. */
  unsafeConfigurationWarning: string | null;
  provenance: NutritionProvenance;
}

/**
 * FR-3.1/FR-3.2/FR-3.3/SR-1/SR-2/NFR-7: generate daily calorie and macro
 * targets deterministically from profile inputs. Never produces specific
 * meals/recipes (FR-3.3) — only the four numeric targets. The SR-1 floor
 * is applied unconditionally; SR-2's warning is advisory only and never
 * blocks generation.
 */
export function generateNutritionTargets(input: NutritionGeneratorInput): GeneratedNutritionTargets {
  const bmr = calculateBmr(input);
  const tdee = calculateTdee(bmr, input.trainingDaysPerWeek);
  const calorieFloor = getCalorieFloor(input.biologicalSex);
  const { preClampCalories, dailyCalories } = calculateCalorieTarget(tdee, input.goal, calorieFloor);
  const macros = calculateMacros(dailyCalories, input.goal, input.weightKg);
  const unsafeConfigurationWarning = checkUnsafeConfiguration({
    goal: input.goal,
    trainingDaysPerWeek: input.trainingDaysPerWeek,
    preClampCalories,
    floor: calorieFloor,
  });

  return {
    dailyCalories,
    proteinG: macros.proteinG,
    carbsG: macros.carbsG,
    fatG: macros.fatG,
    unsafeConfigurationWarning,
    provenance: {
      bmr,
      tdee,
      activityMultiplier: getActivityMultiplier(input.trainingDaysPerWeek),
      goalAdjustmentFraction: GOAL_CALORIE_ADJUSTMENTS[input.goal],
      preClampCalories,
      calorieFloor,
      floorApplied: dailyCalories > preClampCalories,
    },
  };
}
