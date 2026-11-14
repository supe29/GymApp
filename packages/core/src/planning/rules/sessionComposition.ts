// Phase 5: how many exercises a session gets, by split + fitness level
// (spec.md FR-2.3 scaffolding). Plain, exhaustive data table.

import type { FitnessLevel } from '../../validation/profileValidation';
import type { SplitType } from './splitRules';

export interface SessionCompositionRule {
  splitType: SplitType;
  fitnessLevel: FitnessLevel;
  exercisesPerSession: number;
}

/**
 * Exhaustive 4 split types (incl. FR-2.7 'custom') x 3 fitness levels. push_pull_legs sessions get
 * fewer exercises per session than full_body/upper_lower since the week
 * already has more total sessions.
 */
export const SESSION_COMPOSITION_RULES: SessionCompositionRule[] = [
  { splitType: 'full_body', fitnessLevel: 'beginner', exercisesPerSession: 5 },
  { splitType: 'full_body', fitnessLevel: 'intermediate', exercisesPerSession: 6 },
  { splitType: 'full_body', fitnessLevel: 'advanced', exercisesPerSession: 7 },
  { splitType: 'upper_lower', fitnessLevel: 'beginner', exercisesPerSession: 5 },
  { splitType: 'upper_lower', fitnessLevel: 'intermediate', exercisesPerSession: 6 },
  { splitType: 'upper_lower', fitnessLevel: 'advanced', exercisesPerSession: 7 },
  { splitType: 'push_pull_legs', fitnessLevel: 'beginner', exercisesPerSession: 4 },
  { splitType: 'push_pull_legs', fitnessLevel: 'intermediate', exercisesPerSession: 5 },
  { splitType: 'push_pull_legs', fitnessLevel: 'advanced', exercisesPerSession: 6 },
  // FR-2.7: a week mixing focuses (e.g. Push + Core, Pull + Legs) is sized like Upper/Lower.
  { splitType: 'custom', fitnessLevel: 'beginner', exercisesPerSession: 5 },
  { splitType: 'custom', fitnessLevel: 'intermediate', exercisesPerSession: 6 },
  { splitType: 'custom', fitnessLevel: 'advanced', exercisesPerSession: 7 },
];

/** FR-2.3 scaffolding: how many exercises a session gets, by split + level. */
export function getExercisesPerSession(splitType: SplitType, fitnessLevel: FitnessLevel): number {
  const rule = SESSION_COMPOSITION_RULES.find(
    (r) => r.splitType === splitType && r.fitnessLevel === fitnessLevel,
  );
  if (!rule) {
    throw new Error(`No session composition rule for splitType=${splitType}, fitnessLevel=${fitnessLevel}.`);
  }
  return rule.exercisesPerSession;
}
