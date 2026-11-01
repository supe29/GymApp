// Phase 5: sets/reps/intensity guidance, scaled by goal x fitness level
// (spec.md FR-2.3). No numeric starting weight is ever prescribed here —
// there is no logged history yet to base one on; guidance is qualitative
// text instead. `intensityNoteTemplate` contains the literal placeholder
// "{equipmentKind}", substituted by planGenerator.ts with either
// 'bodyweight' or 'loaded' depending on the specific exercise.

import type { FitnessLevel, Goal } from '../../validation/profileValidation';

export interface PrescriptionRule {
  goal: Goal;
  fitnessLevel: FitnessLevel;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  intensityNoteTemplate: string;
}

/** Exhaustive 4 goals x 3 fitness levels. */
export const PRESCRIPTION_RULES: PrescriptionRule[] = [
  // strength
  {
    goal: 'strength',
    fitnessLevel: 'beginner',
    targetSets: 3,
    targetRepsMin: 5,
    targetRepsMax: 8,
    intensityNoteTemplate:
      'Learn the movement pattern with light, controlled {equipmentKind} resistance before adding load.',
  },
  {
    goal: 'strength',
    fitnessLevel: 'intermediate',
    targetSets: 4,
    targetRepsMin: 4,
    targetRepsMax: 6,
    intensityNoteTemplate: 'Use a challenging {equipmentKind} load for the rep range; leave 1-2 reps in reserve.',
  },
  {
    goal: 'strength',
    fitnessLevel: 'advanced',
    targetSets: 5,
    targetRepsMin: 3,
    targetRepsMax: 5,
    intensityNoteTemplate: 'Near-maximal {equipmentKind} effort for the rep range; leave 0-1 reps in reserve.',
  },
  // muscle_gain
  {
    goal: 'muscle_gain',
    fitnessLevel: 'beginner',
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 12,
    intensityNoteTemplate: 'Moderate {equipmentKind} resistance; focus on controlled form through the full range.',
  },
  {
    goal: 'muscle_gain',
    fitnessLevel: 'intermediate',
    targetSets: 4,
    targetRepsMin: 8,
    targetRepsMax: 12,
    intensityNoteTemplate: 'Moderate-to-heavy {equipmentKind} resistance; leave 1-2 reps in reserve.',
  },
  {
    goal: 'muscle_gain',
    fitnessLevel: 'advanced',
    targetSets: 4,
    targetRepsMin: 6,
    targetRepsMax: 10,
    intensityNoteTemplate: 'Heavy {equipmentKind} resistance; leave 0-2 reps in reserve, vary rep range by session.',
  },
  // fat_loss
  {
    goal: 'fat_loss',
    fitnessLevel: 'beginner',
    targetSets: 3,
    targetRepsMin: 10,
    targetRepsMax: 15,
    intensityNoteTemplate: 'Light-to-moderate {equipmentKind} resistance; prioritize consistent form and pacing.',
  },
  {
    goal: 'fat_loss',
    fitnessLevel: 'intermediate',
    targetSets: 3,
    targetRepsMin: 10,
    targetRepsMax: 15,
    intensityNoteTemplate: 'Moderate {equipmentKind} resistance with shorter rest between sets.',
  },
  {
    goal: 'fat_loss',
    fitnessLevel: 'advanced',
    targetSets: 4,
    targetRepsMin: 12,
    targetRepsMax: 15,
    intensityNoteTemplate: 'Moderate {equipmentKind} resistance, higher volume, minimal rest between sets.',
  },
  // general_fitness
  {
    goal: 'general_fitness',
    fitnessLevel: 'beginner',
    targetSets: 3,
    targetRepsMin: 10,
    targetRepsMax: 12,
    intensityNoteTemplate: 'Comfortable {equipmentKind} resistance; focus on learning good form.',
  },
  {
    goal: 'general_fitness',
    fitnessLevel: 'intermediate',
    targetSets: 3,
    targetRepsMin: 10,
    targetRepsMax: 12,
    intensityNoteTemplate: 'Moderate {equipmentKind} resistance; leave 2-3 reps in reserve.',
  },
  {
    goal: 'general_fitness',
    fitnessLevel: 'advanced',
    targetSets: 3,
    targetRepsMin: 10,
    targetRepsMax: 12,
    intensityNoteTemplate: 'Moderate-to-challenging {equipmentKind} resistance; leave 1-2 reps in reserve.',
  },
];

/** FR-2.3: sets/reps/intensity guidance scaled by goal x fitness level. */
export function getPrescription(goal: Goal, fitnessLevel: FitnessLevel): PrescriptionRule {
  const rule = PRESCRIPTION_RULES.find((r) => r.goal === goal && r.fitnessLevel === fitnessLevel);
  if (!rule) {
    throw new Error(`No prescription rule for goal=${goal}, fitnessLevel=${fitnessLevel}.`);
  }
  return rule;
}

/**
 * Isolation movements (curls, raises, extensions) aren't trained in
 * low-rep strength ranges: they get at most 3 sets and a rep range of at
 * least 8-12. Compound (or unknown-mechanic) exercises keep the goal x
 * level rule unchanged.
 */
export function adjustPrescriptionForMechanic(
  rule: PrescriptionRule,
  mechanic: string | null | undefined,
): Pick<PrescriptionRule, 'targetSets' | 'targetRepsMin' | 'targetRepsMax'> {
  if (mechanic !== 'isolation') {
    return {
      targetSets: rule.targetSets,
      targetRepsMin: rule.targetRepsMin,
      targetRepsMax: rule.targetRepsMax,
    };
  }
  return {
    targetSets: Math.min(rule.targetSets, 3),
    targetRepsMin: Math.max(rule.targetRepsMin, 8),
    targetRepsMax: Math.max(rule.targetRepsMax, 12),
  };
}
