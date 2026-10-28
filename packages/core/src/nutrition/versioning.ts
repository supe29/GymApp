// Phase 6: FR-2.4/Flow-2.7-style diffing for nutrition targets, used for
// the "regenerate now?" preview summary. Mirrors ../planning/versioning.ts's
// role and its explicit non-goal: this module does NOT compute
// target_version or superseded_at — those are owned exclusively by the DB
// trigger chain (supabase/migrations/0009_plan_target_versioning.sql).
// Much simpler than the workout-plan diff: nutrition targets are a flat
// set of 4 numbers, not a multi-session/exercise structure.

import type { GeneratedNutritionTargets } from './nutritionGenerator';

export interface ComparableNutritionTargets {
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Converts a freshly generated target set into the shape diffNutritionTargets compares. */
export function toComparableNutritionTargets(targets: GeneratedNutritionTargets): ComparableNutritionTargets {
  return {
    dailyCalories: targets.dailyCalories,
    proteinG: targets.proteinG,
    carbsG: targets.carbsG,
    fatG: targets.fatG,
  };
}

export interface NutritionTargetDiffSummary {
  changed: boolean;
  /** Null when the user has no prior targets yet (first-ever generation). */
  previous: ComparableNutritionTargets | null;
  next: ComparableNutritionTargets;
  deltas: ComparableNutritionTargets;
}

/**
 * FR-2.4/DR-5: structural diff between the currently active nutrition
 * targets and a freshly generated candidate. Pure comparison only — never
 * computes a target_version number.
 */
export function diffNutritionTargets(
  previous: ComparableNutritionTargets | null,
  next: ComparableNutritionTargets,
): NutritionTargetDiffSummary {
  if (!previous) {
    return {
      changed: true,
      previous: null,
      next,
      deltas: { dailyCalories: next.dailyCalories, proteinG: next.proteinG, carbsG: next.carbsG, fatG: next.fatG },
    };
  }

  const deltas: ComparableNutritionTargets = {
    dailyCalories: next.dailyCalories - previous.dailyCalories,
    proteinG: next.proteinG - previous.proteinG,
    carbsG: next.carbsG - previous.carbsG,
    fatG: next.fatG - previous.fatG,
  };

  const changed =
    deltas.dailyCalories !== 0 || deltas.proteinG !== 0 || deltas.carbsG !== 0 || deltas.fatG !== 0;

  return { changed, previous, next, deltas };
}
