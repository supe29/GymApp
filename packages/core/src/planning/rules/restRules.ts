// FR-5.4: rest between sets, per exercise, by fixed rule (AI-1: never a
// model). The goal sets the training stimulus and the exercise's mechanic
// how much recovery a set costs: a multi-joint compound lift taxes more
// muscle (and the nervous system) than a single-joint isolation move.
// Values follow common strength-and-conditioning guidance: long rests for
// strength, moderate for muscle gain, short for fat loss and general fitness.

import type { Goal } from '../../validation/profileValidation';

export type Mechanic = 'compound' | 'isolation';

export const REST_SECONDS: Record<Goal, Record<Mechanic, number>> = {
  strength: { compound: 180, isolation: 90 },
  muscle_gain: { compound: 120, isolation: 75 },
  general_fitness: { compound: 90, isolation: 60 },
  fat_loss: { compound: 75, isolation: 45 },
};

/** Used when the user's goal isn't known (e.g. the profile failed to load). */
export const DEFAULT_GOAL: Goal = 'general_fitness';

const GOAL_PHRASE: Record<Goal, string> = {
  strength: 'For strength, rest long enough to lift heavy again on the next set.',
  muscle_gain: 'For muscle gain, rest enough to keep the next set’s reps up, but not so long that you cool down.',
  general_fitness: 'For general fitness, a moderate rest keeps the session moving.',
  fat_loss: 'For fat loss, shorter rests keep your heart rate up.',
};

const MECHANIC_PHRASE: Record<Mechanic, string> = {
  compound: 'This exercise works several joints and muscle groups at once, so it needs more recovery between sets.',
  isolation: 'This exercise works one joint, so it recovers faster between sets.',
};

export interface RestBetweenSets {
  seconds: number;
  /** Plain-language reason, shown on demand (NFR-7). */
  reason: string;
}

/**
 * FR-5.4: the rest between sets of one exercise. An exercise whose mechanic
 * isn't known is treated as compound, the longer rest, so a hard lift is
 * never rushed.
 */
export function restBetweenSets(goal: Goal | null | undefined, mechanic: string | null | undefined): RestBetweenSets {
  const knownGoal = goal ?? DEFAULT_GOAL;
  const kind: Mechanic = mechanic === 'isolation' ? 'isolation' : 'compound';
  return {
    seconds: REST_SECONDS[knownGoal][kind],
    reason: `${MECHANIC_PHRASE[kind]} ${GOAL_PHRASE[knownGoal]}`,
  };
}

/** m:ss, e.g. 90 → "1:30". */
export function formatRest(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
