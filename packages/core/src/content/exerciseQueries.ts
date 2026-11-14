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

/** Lower-case words, with hyphens, underscores and other punctuation treated as spaces. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function everyWordMatches(queryWords: string[], targetWords: string[]): boolean {
  return queryWords.every((q) => targetWords.some((t) => t.startsWith(q)));
}

export interface ExerciseSearchResult {
  /** Best matches first, at most `limit` of them. */
  results: ExerciseWithTags[];
  /** How many exercises matched in total, before the limit. */
  total: number;
}

/**
 * FR-5.3: free-text search over an exercise list, for the add-exercise
 * picker. Every query word must start a word of the exercise's name or of
 * one of its muscle keys ("bench" → "Barbell Bench Press", "pull up" →
 * "Pull-Up", "chest" → chest exercises). Ranked: name starts with the
 * query, then name match, then primary-muscle match, then secondary;
 * ties alphabetical. An empty query lists everything alphabetically.
 */
export function searchExercises(
  exercises: readonly ExerciseWithTags[],
  query: string,
  options: { limit?: number } = {},
): ExerciseSearchResult {
  const limit = options.limit ?? 30;
  const queryWords = words(query);
  const phrase = queryWords.join(' ');

  const ranked: { exercise: ExerciseWithTags; rank: number }[] = [];
  for (const exercise of exercises) {
    const nameWords = words(exercise.name);
    let rank: number | null = null;
    if (queryWords.length === 0) rank = 0;
    else if (nameWords.join(' ').startsWith(phrase)) rank = 0;
    else if (everyWordMatches(queryWords, nameWords)) rank = 1;
    else if (everyWordMatches(queryWords, [...nameWords, ...exercise.primaryMuscleKeys.flatMap(words)])) rank = 2;
    else if (
      everyWordMatches(queryWords, [
        ...nameWords,
        ...exercise.primaryMuscleKeys.flatMap(words),
        ...exercise.secondaryMuscleKeys.flatMap(words),
      ])
    )
      rank = 3;
    if (rank !== null) ranked.push({ exercise, rank });
  }

  ranked.sort((a, b) => a.rank - b.rank || a.exercise.name.localeCompare(b.exercise.name));
  return { results: ranked.slice(0, limit).map((r) => r.exercise), total: ranked.length };
}
