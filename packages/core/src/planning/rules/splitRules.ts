// Phase 5: deterministic split-selection rule table (spec.md FR-2.1).
// Plain data — the resolution algorithm lives in ../splitSelector.ts.

import type { FitnessLevel, Goal } from '../../validation/profileValidation';

/** The three rule-table splits. */
export type NamedSplitType = 'full_body' | 'upper_lower' | 'push_pull_legs';

/** A plan's split: a named one, or 'custom' when its days mix focuses (FR-2.7). */
export type SplitType = NamedSplitType | 'custom';

export interface SplitRule {
  /** NFR-7 traceability key, surfaced in a generated plan's provenance. */
  id: string;
  goal: Goal | 'any';
  fitnessLevel: FitnessLevel | 'any';
  minDays: number;
  maxDays: number;
  splitType: NamedSplitType;
  /** Plain-English justification, directly displayable (NFR-7). */
  rationale: string;
}

/**
 * FR-2.1: goal x fitness level x training-days-per-week -> training split.
 * Resolution (see selectSplit in ../splitSelector.ts) picks the matching
 * rule with the highest specificity (an exact goal/level match outranks
 * 'any'), so e.g. split-03 beats split-05 for (strength, intermediate, 3).
 */
export const SPLIT_RULES: SplitRule[] = [
  {
    id: 'split-01',
    goal: 'any',
    fitnessLevel: 'any',
    minDays: 1,
    maxDays: 2,
    splitType: 'full_body',
    rationale: 'Too few days per week for a split; full-body maximizes per-muscle frequency.',
  },
  {
    id: 'split-02',
    goal: 'any',
    fitnessLevel: 'beginner',
    minDays: 3,
    maxDays: 4,
    splitType: 'full_body',
    rationale:
      'Beginners benefit from repeated full-body practice to build technique before fragmenting into upper/lower.',
  },
  {
    id: 'split-03',
    goal: 'strength',
    fitnessLevel: 'intermediate',
    minDays: 3,
    maxDays: 4,
    splitType: 'full_body',
    rationale: 'A strength goal benefits from higher per-lift frequency.',
  },
  {
    id: 'split-04',
    goal: 'strength',
    fitnessLevel: 'advanced',
    minDays: 3,
    maxDays: 4,
    splitType: 'full_body',
    rationale: 'A strength goal benefits from higher per-lift frequency, even at advanced level.',
  },
  {
    id: 'split-05',
    goal: 'any',
    fitnessLevel: 'intermediate',
    minDays: 3,
    maxDays: 4,
    splitType: 'upper_lower',
    rationale: 'Default split once technique is established and the goal is not strength-specific.',
  },
  {
    id: 'split-06',
    goal: 'any',
    fitnessLevel: 'advanced',
    minDays: 3,
    maxDays: 4,
    splitType: 'upper_lower',
    rationale: 'Default split at advanced level and the goal is not strength-specific.',
  },
  {
    id: 'split-07',
    goal: 'any',
    fitnessLevel: 'beginner',
    minDays: 5,
    maxDays: 7,
    splitType: 'upper_lower',
    rationale:
      'Beginners at high weekly frequency still get the simpler two-way split, not a full three-way rotation.',
  },
  {
    id: 'split-08',
    goal: 'any',
    fitnessLevel: 'intermediate',
    minDays: 5,
    maxDays: 7,
    splitType: 'push_pull_legs',
    rationale: 'Enough days and experience for a full push/pull/legs rotation.',
  },
  {
    id: 'split-09',
    goal: 'any',
    fitnessLevel: 'advanced',
    minDays: 5,
    maxDays: 7,
    splitType: 'push_pull_legs',
    rationale: 'Enough days for a full push/pull/legs rotation at advanced level.',
  },
];
