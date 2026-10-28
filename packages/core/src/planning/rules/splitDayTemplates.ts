// Phase 5: canonical day templates per training split (spec.md FR-2.1).
// Muscle-group keys match /data/exercises/mapping/muscleTaxonomy.json
// exactly. `neck` is deliberately not assigned a default template day —
// a minor, conscious scope note (common default-program practice), not an
// open question requiring resolution.

import type { SplitType } from './splitRules';

export interface DayTemplate {
  name: string;
  primaryMuscleGroupKeys: string[];
}

/** FR-2.1: which muscle groups each split's day(s) target. */
export const SPLIT_DAY_TEMPLATES: Record<SplitType, DayTemplate[]> = {
  full_body: [
    {
      name: 'Full Body',
      primaryMuscleGroupKeys: [
        'quadriceps',
        'hamstrings',
        'glutes',
        'chest',
        'lats',
        'middle_back',
        'shoulders',
        'biceps',
        'triceps',
        'abdominals',
      ],
    },
  ],
  upper_lower: [
    {
      name: 'Upper',
      primaryMuscleGroupKeys: [
        'chest',
        'lats',
        'middle_back',
        'shoulders',
        'biceps',
        'triceps',
        'forearms',
        'traps',
      ],
    },
    {
      name: 'Lower',
      primaryMuscleGroupKeys: [
        'quadriceps',
        'hamstrings',
        'glutes',
        'calves',
        'adductors',
        'abductors',
        'abdominals',
        'lower_back',
      ],
    },
  ],
  push_pull_legs: [
    {
      name: 'Push',
      primaryMuscleGroupKeys: ['chest', 'shoulders', 'triceps'],
    },
    {
      name: 'Pull',
      primaryMuscleGroupKeys: ['lats', 'middle_back', 'traps', 'biceps', 'forearms', 'lower_back'],
    },
    {
      name: 'Legs',
      primaryMuscleGroupKeys: [
        'quadriceps',
        'hamstrings',
        'glutes',
        'calves',
        'adductors',
        'abductors',
        'abdominals',
      ],
    },
  ],
};
