// Which library exercises the plan generator may prescribe, and in what
// preference order (spec.md FR-2.1/FR-2.3). Plain data tables plus two
// small pure helpers, consumed by planGenerator.ts.

import type { ExerciseWithTags } from '../../content/exerciseQueries';

/**
 * Source-dataset categories that are resistance training. Everything else
 * (stretching/SMR, cardio, plyometrics, olympic_weightlifting, strongman)
 * is excluded from generated sessions: a 4x12 prescription of foam rolling,
 * skipping or a power clean is not a sensible plan. Exercises with a null
 * category (seeded before migration 0010) stay eligible.
 */
export const PRESCRIBABLE_CATEGORIES: ReadonlySet<string> = new Set(['strength', 'powerlifting']);

export function isPrescribable(exercise: ExerciseWithTags): boolean {
  return exercise.category == null || PRESCRIBABLE_CATEGORIES.has(exercise.category);
}

/**
 * Staple movements per muscle group, most-preferred first, by exact
 * exercise name from data/exercises/source/exercises.json. Every entry is
 * a primary-muscle match for its key and a strength/powerlifting
 * exercise. Equipment filtering still applies, so a bodyweight-only
 * profile falls through to the bodyweight staples (or non-staples).
 */
export const STAPLE_EXERCISES_BY_MUSCLE: Record<string, readonly string[]> = {
  chest: [
    'Barbell Bench Press - Medium Grip',
    'Dumbbell Bench Press',
    'Incline Dumbbell Press',
    'Barbell Incline Bench Press - Medium Grip',
    'Pushups',
    'Dips - Chest Version',
    'Cable Crossover',
    'Dumbbell Flyes',
  ],
  lats: [
    'Pullups',
    'Wide-Grip Lat Pulldown',
    'Chin-Up',
    'Close-Grip Front Lat Pulldown',
    'V-Bar Pulldown',
    'Straight-Arm Pulldown',
  ],
  middle_back: [
    'Bent Over Barbell Row',
    'One-Arm Dumbbell Row',
    'Seated Cable Rows',
    'T-Bar Row with Handle',
    'Inverted Row',
  ],
  shoulders: [
    'Standing Military Press',
    'Dumbbell Shoulder Press',
    'Side Lateral Raise',
    'Arnold Dumbbell Press',
    'Face Pull',
    'Reverse Flyes',
  ],
  biceps: ['Barbell Curl', 'Dumbbell Bicep Curl', 'Hammer Curls', 'EZ-Bar Curl', 'Preacher Curl'],
  triceps: [
    'Close-Grip Barbell Bench Press',
    'Triceps Pushdown',
    'Dips - Triceps Version',
    'EZ-Bar Skullcrusher',
    'Standing Dumbbell Triceps Extension',
    'Bench Dips',
  ],
  forearms: [
    'Palms-Up Barbell Wrist Curl Over A Bench',
    'Palms-Down Wrist Curl Over A Bench',
    'Seated Dumbbell Palms-Up Wrist Curl',
    'Wrist Roller',
  ],
  traps: ['Barbell Shrug', 'Dumbbell Shrug'],
  quadriceps: [
    'Barbell Squat',
    'Leg Press',
    'Front Barbell Squat',
    'Goblet Squat',
    'Dumbbell Lunges',
    'Bodyweight Squat',
    'Leg Extensions',
  ],
  hamstrings: [
    'Romanian Deadlift',
    'Lying Leg Curls',
    'Stiff-Legged Barbell Deadlift',
    'Seated Leg Curl',
    'Glute Ham Raise',
  ],
  glutes: ['Barbell Hip Thrust', 'Barbell Glute Bridge', 'Glute Kickback', 'Butt Lift (Bridge)'],
  calves: [
    'Standing Calf Raises',
    'Seated Calf Raise',
    'Calf Press On The Leg Press Machine',
    'Standing Dumbbell Calf Raise',
  ],
  adductors: ['Thigh Adductor', 'Band Hip Adductions'],
  abductors: ['Thigh Abductor', 'Monster Walk'],
  abdominals: ['Plank', 'Crunches', 'Hanging Leg Raise', 'Cable Crunch', 'Ab Roller'],
  lower_back: ['Hyperextensions (Back Extensions)', 'Barbell Deadlift'],
};

function stapleRank(exercise: ExerciseWithTags, muscleGroupKey: string): number {
  const staples = STAPLE_EXERCISES_BY_MUSCLE[muscleGroupKey] ?? [];
  const index = staples.indexOf(exercise.name);
  return index === -1 ? staples.length : index;
}

/**
 * Preference order for one muscle-group slot: primary-muscle matches,
 * then staples in listed order, then compound before isolation, then name
 * (id as a final tiebreak, so the order never depends on input order).
 */
export function compareCandidates(
  a: ExerciseWithTags,
  b: ExerciseWithTags,
  muscleGroupKey: string,
): number {
  const aPrimary = a.primaryMuscleKeys.includes(muscleGroupKey) ? 0 : 1;
  const bPrimary = b.primaryMuscleKeys.includes(muscleGroupKey) ? 0 : 1;
  if (aPrimary !== bPrimary) return aPrimary - bPrimary;
  const staple = stapleRank(a, muscleGroupKey) - stapleRank(b, muscleGroupKey);
  if (staple !== 0) return staple;
  const aCompound = a.mechanic === 'compound' ? 0 : 1;
  const bCompound = b.mechanic === 'compound' ? 0 : 1;
  if (aCompound !== bCompound) return aCompound - bCompound;
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}
