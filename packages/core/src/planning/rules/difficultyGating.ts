// Phase 5: SR-3 beginner exercise safety. Operationalizes "high-skill
// compound lift" as difficulty === 'advanced' — the schema/taxonomy has no
// separate technical-complexity tag, and the source dataset's own hardest
// tier ('expert', mapped to 'advanced' by data/exercises/scripts/importAndTag.ts)
// is a legitimate proxy for it, not an arbitrary one. Intermediate/advanced
// users are never gated, per SR-3's explicit scope.

import type { ExerciseWithTags } from '../../content/exerciseQueries';
import type { FitnessLevel } from '../../validation/profileValidation';

export interface GatingResult {
  exercise: ExerciseWithTags;
  /** True only when fitnessLevel is 'beginner' AND >=1 advanced candidate existed in the pool. */
  gateApplied: boolean;
  /** Advanced candidates deliberately not picked because a safer alternative existed. */
  avoidedAdvancedExerciseIds: string[];
  /** True only when no safer alternative existed and an advanced exercise had to be used anyway. */
  usedAdvancedFallback: boolean;
}

/**
 * SR-3: for beginner fitness level, prefers any non-'advanced' candidate
 * over an 'advanced' one; falls back to an 'advanced' candidate only when
 * the ranked pool contains no safer alternative for this muscle/equipment
 * combination (the plan must substitute a lower-complexity alternative
 * targeting the same muscle group rather than silently prescribing the
 * advanced movement, "unless no safer alternative exists"). Intermediate
 * and advanced fitness levels are not gated — this function returns
 * rankedCandidates[0] unconditionally for them.
 *
 * The caller is responsible for muscle/equipment filtering and ranking
 * (primary-match-first, then id) before calling this; this function only
 * applies the beginner-safety gate to an already-ranked list.
 */
export function selectExerciseForSlot(
  rankedCandidates: ExerciseWithTags[],
  fitnessLevel: FitnessLevel,
): GatingResult | null {
  if (rankedCandidates.length === 0) {
    return null;
  }

  if (fitnessLevel !== 'beginner') {
    return {
      exercise: rankedCandidates[0],
      gateApplied: false,
      avoidedAdvancedExerciseIds: [],
      usedAdvancedFallback: false,
    };
  }

  const safe = rankedCandidates.filter((e) => e.difficulty !== 'advanced');
  const advanced = rankedCandidates.filter((e) => e.difficulty === 'advanced');
  const gateApplied = advanced.length > 0;

  if (safe.length > 0) {
    return {
      exercise: safe[0],
      gateApplied,
      avoidedAdvancedExerciseIds: advanced.map((e) => e.id),
      usedAdvancedFallback: false,
    };
  }

  // No safer alternative exists for this muscle/equipment slot (SR-3's
  // explicit escape hatch) — prescribe the advanced exercise anyway rather
  // than leaving the slot empty.
  return {
    exercise: advanced[0],
    gateApplied,
    avoidedAdvancedExerciseIds: [],
    usedAdvancedFallback: true,
  };
}
