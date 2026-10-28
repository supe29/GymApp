// Phase 8: read-time overlay of accepted/overridden progression
// suggestions onto a plan's static prescribed targets (spec.md FR-6.1/FR-6.2).
// planned_session_exercises is immutable (no UPDATE/DELETE grant exists
// at all for authenticated users — see 0008_rls_policies.sql), so an
// accepted suggestion is never written back onto the plan; instead,
// packages/api-client/src/plans.ts layers the latest effective suggestion
// per exercise over the static row at read time, via this pure function.
// target_reps_max is deliberately never touched — only the floor
// (targetRepsMin) and weight move; the rep *range* itself stays as Phase
// 5 generated it.

export interface SuggestionLike {
  status: 'accepted' | 'overridden';
  suggestedWeightKg: number | null;
  suggestedReps: number | null;
  overriddenWeightKg: number | null;
  overriddenReps: number | null;
}

export interface EffectiveSuggestionValue {
  weightKg: number | null;
  repsMin: number | null;
}

/** FR-6.2: an overridden suggestion's own values take precedence over the originally-suggested ones. */
export function effectiveSuggestionValue(suggestion: SuggestionLike): EffectiveSuggestionValue {
  if (suggestion.status === 'overridden') {
    return { weightKg: suggestion.overriddenWeightKg, repsMin: suggestion.overriddenReps };
  }
  return { weightKg: suggestion.suggestedWeightKg, repsMin: suggestion.suggestedReps };
}

export interface OverlayableExercise {
  exerciseId: string;
  targetWeightKg: number | null;
  targetRepsMin: number;
}

/**
 * FR-6.1: returns a new array with each exercise's targetWeightKg/
 * targetRepsMin overridden by its effective suggestion value, if one
 * exists for that exerciseId. Exercises with no matching suggestion are
 * returned unchanged (same reference). Generic over T so callers (e.g.
 * api-client's PersistedPrescribedExercise, which carries fields — id,
 * exerciseName, orderIndex, intensityNote — that don't belong in this
 * framework-agnostic package) can pass their own richer shape directly.
 */
export function applyProgressionOverlay<T extends OverlayableExercise>(
  exercises: T[],
  effectiveByExerciseId: Map<string, EffectiveSuggestionValue>,
): T[] {
  return exercises.map((exercise) => {
    const effective = effectiveByExerciseId.get(exercise.exerciseId);
    if (!effective) {
      return exercise;
    }
    return {
      ...exercise,
      targetWeightKg: effective.weightKg ?? exercise.targetWeightKg,
      targetRepsMin: effective.repsMin ?? exercise.targetRepsMin,
    };
  });
}
