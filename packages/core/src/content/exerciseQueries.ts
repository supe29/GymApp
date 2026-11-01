// Phase 3: pure, deterministic exercise-filtering helpers. Framework- and
// backend-agnostic by design (per this package's architecture) — these
// operate on an already-fetched, denormalized array of exercises with
// their tags attached; the actual Supabase query that assembles that
// shape from exercises/exercise_muscles/exercise_equipment is a
// packages/api-client concern for whichever later phase first needs it
// (the exercise browser, Phase 4; plan generation, Phase 5).

import type { FitnessLevel } from '../validation/profileValidation';

/** Matches exercises.difficulty (spec.md FR-2.3, SR-3) — same domain as FitnessLevel by design. */
export type Difficulty = FitnessLevel;

export interface ExerciseWithTags {
  id: string;
  name: string;
  instructions: string | null;
  difficulty: Difficulty;
  /** Muscle-group keys (muscle_groups.key) this exercise targets as its primary focus. */
  primaryMuscleKeys: string[];
  /** Muscle-group keys this exercise targets secondarily. */
  secondaryMuscleKeys: string[];
  /** Equipment-item keys (equipment_items.key) required to perform this exercise; empty = no equipment needed. */
  requiredEquipmentKeys: string[];
  /** Source-dataset exercise type (exercises.category); null/absent if not seeded. */
  category?: string | null;
  /** 'compound' | 'isolation' (exercises.mechanic); null/absent if unknown. */
  mechanic?: string | null;
}

/**
 * FR-4.2: exercises targeting a given muscle group, as primary or
 * secondary.
 */
export function filterByMuscleGroup(
  exercises: ExerciseWithTags[],
  muscleGroupKey: string,
): ExerciseWithTags[] {
  return exercises.filter(
    (e) =>
      e.primaryMuscleKeys.includes(muscleGroupKey) ||
      e.secondaryMuscleKeys.includes(muscleGroupKey),
  );
}

/**
 * FR-2.2/SR-6: exercises performable with (a subset of) the given
 * available equipment — every piece of equipment the exercise requires
 * must be in `availableEquipmentKeys`. An exercise requiring no equipment
 * always passes, regardless of what's available.
 */
export function filterByEquipmentSubset(
  exercises: ExerciseWithTags[],
  availableEquipmentKeys: string[],
): ExerciseWithTags[] {
  const available = new Set(availableEquipmentKeys);
  return exercises.filter((e) => e.requiredEquipmentKeys.every((key) => available.has(key)));
}

/** Exercises tagged with exactly the given difficulty (FR-2.3). */
export function filterByDifficulty(
  exercises: ExerciseWithTags[],
  difficulty: Difficulty,
): ExerciseWithTags[] {
  return exercises.filter((e) => e.difficulty === difficulty);
}
