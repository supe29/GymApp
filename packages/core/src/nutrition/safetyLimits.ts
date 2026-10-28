// Phase 6: SR-1 safe-minimum calorie floor and SR-2 unsafe-configuration
// warning. Resolves OQ-1 (exact floor values) and OQ-8 (SR-2's trigger
// thresholds) — see /docs/decisions/OQ-1-safe-calorie-floor.md for the
// full rationale. Pure, deterministic.

import type { BiologicalSex, Goal } from '../validation/profileValidation';

/**
 * SR-1/OQ-1: safe-minimum daily calorie floors by biological sex, per
 * spec.md's own reference values. `prefer_not_to_say` uses the HIGHER
 * (safer) of the two sex-specific floors — never under-shoot safety when
 * sex is unknown, regardless of the user's actual physiology.
 */
export const SEX_CALORIE_FLOORS: Record<BiologicalSex, number> = {
  female: 1200,
  male: 1500,
  prefer_not_to_say: 1500,
};

/** SR-1: the safe-minimum calorie floor that applies to this user. */
export function getCalorieFloor(biologicalSex: BiologicalSex): number {
  return SEX_CALORIE_FLOORS[biologicalSex];
}

/** SR-2/OQ-8: training frequency considered "high volume" for the purposes of the unsafe-configuration check. */
export const HIGH_TRAINING_VOLUME_DAYS_THRESHOLD = 6;

/** SR-2/OQ-8: how far below the floor a pre-clamp calculation must fall to count as an "extreme" deficit. */
export const UNSAFE_DEFICIT_MARGIN_KCAL = 300;

export interface UnsafeConfigurationCheckInput {
  goal: Goal;
  trainingDaysPerWeek: number;
  /** The goal-adjusted calorie target BEFORE the SR-1 floor clamp is applied. */
  preClampCalories: number;
  /** The SR-1 floor that applies to this user (from getCalorieFloor). */
  floor: number;
}

/**
 * SR-2/OQ-8: non-blocking unsafe-configuration check. Generation always
 * proceeds (the SR-1 floor still clamps the final number) — this only
 * decides whether a warning should be surfaced to the user. Returns null
 * when the configuration is unremarkable.
 *
 * Triggers on either (a) an aggressive fat-loss goal combined with a high
 * training frequency (spec's own named example of "extreme simultaneous
 * aggressive deficit + high training volume"), or (b) a pre-clamp
 * calculation that would have landed meaningfully below the safe floor
 * had the floor not clamped it.
 */
export function checkUnsafeConfiguration(input: UnsafeConfigurationCheckInput): string | null {
  const { goal, trainingDaysPerWeek, preClampCalories, floor } = input;
  const aggressiveDeficitAndHighVolume =
    goal === 'fat_loss' && trainingDaysPerWeek >= HIGH_TRAINING_VOLUME_DAYS_THRESHOLD;
  const wouldHaveBreachedFloor = preClampCalories < floor - UNSAFE_DEFICIT_MARGIN_KCAL;

  if (aggressiveDeficitAndHighVolume && wouldHaveBreachedFloor) {
    return 'This combination of an aggressive fat-loss goal and a high training frequency produced a calorie target well below the safe minimum. Your target has been raised to the safe floor, but consider a less aggressive goal or lower training frequency.';
  }
  if (aggressiveDeficitAndHighVolume) {
    return 'Combining an aggressive fat-loss goal with a high training frequency (6+ days/week) is generally not recommended without guidance. Consider reducing training frequency or choosing a less aggressive goal.';
  }
  if (wouldHaveBreachedFloor) {
    return 'Your calculated calorie target was below the safe minimum for your profile; it has been raised to the safe floor.';
  }
  return null;
}
