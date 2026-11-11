// FR-2.7: what a training day focuses on. Built from the existing split
// day templates (./splitDayTemplates.ts) so the muscle lists stay defined
// in one place; a day may combine two focuses (e.g. Pull + Legs) and add a
// core finisher.

import { SPLIT_DAY_TEMPLATES } from './splitDayTemplates';

export type FocusKey = 'full_body' | 'upper' | 'lower' | 'push' | 'pull' | 'legs';

export const FOCUS_KEYS: FocusKey[] = ['full_body', 'upper', 'lower', 'push', 'pull', 'legs'];

export const FOCUS_LABEL: Record<FocusKey, string> = {
  full_body: 'Full Body',
  upper: 'Upper',
  lower: 'Lower',
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
};

export const FOCUS_MUSCLES: Record<FocusKey, readonly string[]> = {
  full_body: SPLIT_DAY_TEMPLATES.full_body[0].primaryMuscleGroupKeys,
  upper: SPLIT_DAY_TEMPLATES.upper_lower[0].primaryMuscleGroupKeys,
  lower: SPLIT_DAY_TEMPLATES.upper_lower[1].primaryMuscleGroupKeys,
  push: SPLIT_DAY_TEMPLATES.push_pull_legs[0].primaryMuscleGroupKeys,
  pull: SPLIT_DAY_TEMPLATES.push_pull_legs[1].primaryMuscleGroupKeys,
  legs: SPLIT_DAY_TEMPLATES.push_pull_legs[2].primaryMuscleGroupKeys,
};

/** The muscle group a "+ Core" day adds dedicated exercises for. */
export const CORE_MUSCLE = 'abdominals';

export interface DayPlan {
  /** One or two focuses; two combine their muscle lists (e.g. ['pull', 'legs']). */
  focus: FocusKey[];
  /** Add a core finisher (dedicated ab exercises at the end of the session). */
  core: boolean;
  /** NFR-7: why this day was recommended (absent on days the user set). */
  rationale?: string;
}

/**
 * The day's muscle groups without duplicates. Two focuses are interleaved
 * (first of each, then second of each, ...) so a size-capped session
 * covers both instead of filling up on the first one's list. With core
 * on, abs are left to the finisher.
 */
export function dayPlanMuscles(plan: DayPlan): string[] {
  const lists = plan.focus.map((f) => FOCUS_MUSCLES[f]);
  const longest = Math.max(...lists.map((l) => l.length));
  const interleaved: string[] = [];
  for (let i = 0; i < longest; i += 1) {
    for (const list of lists) if (i < list.length) interleaved.push(list[i]);
  }
  const muscles = [...new Set(interleaved)];
  return plan.core ? muscles.filter((m) => m !== CORE_MUSCLE) : muscles;
}

/** e.g. "Pull + Legs + Core". */
export function dayPlanName(plan: DayPlan): string {
  return [...plan.focus.map((f) => FOCUS_LABEL[f]), ...(plan.core ? ['Core'] : [])].join(' + ');
}

/** Whether the day already works abs without a core finisher. */
export function focusIncludesCore(focus: readonly FocusKey[]): boolean {
  return focus.some((f) => FOCUS_MUSCLES[f].includes(CORE_MUSCLE));
}

/** A stored day plan if it is well-formed (1-2 known, distinct focuses), else null. */
export function validDayPlan(raw: unknown): DayPlan | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { focus, core } = raw as { focus?: unknown; core?: unknown };
  if (!Array.isArray(focus) || focus.length < 1 || focus.length > 2) return null;
  if (!focus.every((f): f is FocusKey => FOCUS_KEYS.includes(f as FocusKey))) return null;
  if (new Set(focus).size !== focus.length) return null;
  return { focus: [...focus], core: core === true };
}
