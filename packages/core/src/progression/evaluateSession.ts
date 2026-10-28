// Phase 8: deterministic progressive-overload evaluation (spec.md
// FR-6.1/FR-6.3, SR-4, AC-6, AC-7). Pure, synchronous — reads only an
// already-fetched array of Set Log entries (packages/core/src/logs/logAggregation.ts's
// shape), per that module's "read exclusively through this module" mandate.
// Implements the "double progression" rule resolving OQ-3 — see
// /docs/decisions/OQ-3-progression-increment-rule.md.

import type { SetLogEntry } from '../logs/logAggregation';
import { REP_INCREMENT, WEIGHT_INCREMENT_KG } from './rules/incrementRules';

export type ProgressionAction = 'increase_weight' | 'increase_reps' | 'hold';

export interface ExercisePrescription {
  exerciseId: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number | null;
  targetWeightKg: number | null;
}

export interface ProgressionEvaluationResult {
  action: ProgressionAction;
  suggestedWeightKg: number | null;
  suggestedReps: number | null;
  rationale: string;
}

/**
 * FR-6.1/SR-4: evaluates one exercise's logged sets against its
 * prescription for this session, producing a next-occurrence suggestion.
 * Returns null when nothing was logged for this exercise at all (e.g. a
 * skipped slot) — there is nothing to evaluate.
 *
 * Double progression: full success (every one of the first `targetSets`
 * sets reaches the rep ceiling) with a tracked weight -> increase weight
 * and reset reps to the floor; full success with no tracked weight
 * (bodyweight) -> increase reps past the ceiling instead; partial success
 * (every set met the floor but not all reached the ceiling) -> increase
 * reps toward the ceiling, weight untouched; any missed set (below the
 * floor, or a set never logged) -> hold (SR-4: never an increase after a
 * miss, regardless of how the other sets went).
 */
export function evaluateExercisePerformance(
  prescription: ExercisePrescription,
  loggedSets: SetLogEntry[],
): ProgressionEvaluationResult | null {
  if (loggedSets.length === 0) {
    return null;
  }

  const setByIndex = new Map(loggedSets.map((log) => [log.setIndex, log]));
  const ceiling = prescription.targetRepsMax ?? prescription.targetRepsMin;

  let anyMissed = false;
  let allReachedCeiling = true;

  for (let setIndex = 1; setIndex <= prescription.targetSets; setIndex += 1) {
    const reps = setByIndex.get(setIndex)?.reps ?? null;
    if (reps === null || reps < prescription.targetRepsMin) {
      anyMissed = true;
      allReachedCeiling = false;
    } else if (reps < ceiling) {
      allReachedCeiling = false;
    }
  }

  if (anyMissed) {
    return {
      action: 'hold',
      suggestedWeightKg: prescription.targetWeightKg,
      suggestedReps: null,
      rationale: `You missed at least one prescribed set (fewer than ${prescription.targetRepsMin} reps, or a set wasn't completed), so we're keeping the same weight and reps next time.`,
    };
  }

  if (allReachedCeiling) {
    if (prescription.targetWeightKg !== null) {
      return {
        action: 'increase_weight',
        suggestedWeightKg: prescription.targetWeightKg + WEIGHT_INCREMENT_KG,
        suggestedReps: prescription.targetRepsMin,
        rationale: `You hit ${ceiling}+ reps on every set last time, so we're increasing the weight by ${WEIGHT_INCREMENT_KG}kg and resetting back to ${prescription.targetRepsMin} reps.`,
      };
    }
    return {
      action: 'increase_reps',
      suggestedWeightKg: null,
      suggestedReps: ceiling + REP_INCREMENT,
      rationale: `You hit ${ceiling}+ reps on every set last time, so we're aiming for ${ceiling + REP_INCREMENT} reps next time.`,
    };
  }

  return {
    action: 'increase_reps',
    suggestedWeightKg: null,
    suggestedReps: prescription.targetRepsMin + REP_INCREMENT,
    rationale: `You completed every prescribed set but didn't reach the top of your rep range, so we're aiming for ${prescription.targetRepsMin + REP_INCREMENT} reps next time before increasing weight.`,
  };
}
