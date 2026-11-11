// FR-2.7: which focus each training day gets, from the user's goal, level
// and the spacing of their chosen weekdays (packages/core weekSchedule.ts
// FR-2.5). Deterministic and pure, like the rest of planning/.
//
// Recovery rule: a muscle group shouldn't be the main work on two days in
// a row. With rest days between sessions a full-body day is fine; when a
// session falls the day after (or before) another, the full-body family
// splits into Upper/Lower instead. Upper/Lower and Push/Pull/Legs already
// rotate so consecutive days differ.

import type { FitnessLevel, Goal } from '../validation/profileValidation';
import { FOCUS_LABEL, focusIncludesCore, validDayPlan, type DayPlan, type FocusKey } from './rules/dayFocus';
import type { NamedSplitType } from './rules/splitRules';
import { selectSplit } from './splitSelector';
import type { Weekday } from './weekSchedule';

export type PlanSplitPreference = 'auto' | NamedSplitType | 'custom';

export interface PlanPreferences {
  split: PlanSplitPreference;
  /** Only for 'custom': one day plan per training weekday, in weekday order. */
  days?: DayPlan[];
}

const ROTATION: Record<Exclude<NamedSplitType, 'full_body'>, FocusKey[]> = {
  upper_lower: ['upper', 'lower'],
  push_pull_legs: ['push', 'pull', 'legs'],
};

/** Days since the previous training day, wrapping Sunday -> Monday. */
function gapBefore(weekdays: readonly Weekday[], i: number): number {
  if (weekdays.length === 1) return 7;
  return i === 0 ? weekdays[0] + 7 - weekdays[weekdays.length - 1] : weekdays[i] - weekdays[i - 1];
}

function gapAfter(weekdays: readonly Weekday[], i: number): number {
  return gapBefore(weekdays, (i + 1) % weekdays.length);
}

/** Core finisher on about every other training day whose focus doesn't already train abs. */
function withCoreDefaults(plans: DayPlan[]): DayPlan[] {
  let eligible = 0;
  return plans.map((plan) => {
    if (focusIncludesCore(plan.focus)) return { ...plan, core: false };
    const core = eligible % 2 === 0;
    eligible += 1;
    return { ...plan, core };
  });
}

/**
 * Training-day indices in the order the week's sequence should run: from
 * the day after the longest rest, wrapping round. Alternating from there
 * means the last session before that rest and the first after it never
 * collide (unless every day is a training day).
 */
function sequenceOrder(weekdays: readonly Weekday[]): number[] {
  let start = 0;
  weekdays.forEach((_, i) => {
    if (gapBefore(weekdays, i) > gapBefore(weekdays, start)) start = i;
  });
  return weekdays.map((_, k) => (start + k) % weekdays.length);
}

function rotationPlans(split: Exclude<NamedSplitType, 'full_body'>, weekdays: readonly Weekday[], why: string): DayPlan[] {
  const rotation = ROTATION[split];
  const plans: DayPlan[] = new Array(weekdays.length);
  sequenceOrder(weekdays).forEach((dayIndex, k) => {
    plans[dayIndex] = { focus: [rotation[k % rotation.length]], core: false, rationale: why };
  });
  return plans;
}

/**
 * FR-2.7: the recommended focus for each chosen weekday. The base split
 * still comes from the FR-2.1 rule table (selectSplit); for the full-body
 * family, back-to-back days are split into Upper/Lower so muscles get a
 * rest day.
 */
export function recommendDayPlans(input: { goal: Goal; fitnessLevel: FitnessLevel; weekdays: readonly Weekday[] }): DayPlan[] {
  const { splitType } = selectSplit({ goal: input.goal, fitnessLevel: input.fitnessLevel, trainingDaysPerWeek: input.weekdays.length });

  if (splitType !== 'full_body') {
    return withCoreDefaults(
      rotationPlans(splitType, input.weekdays, `${splitType === 'upper_lower' ? 'Upper/Lower' : 'Push/Pull/Legs'} rotation, so back-to-back days work different muscles.`),
    );
  }

  const plans: DayPlan[] = new Array(input.weekdays.length);
  let previousFocus: FocusKey | null = null;
  let lastHalf: FocusKey | null = null;
  for (const i of sequenceOrder(input.weekdays)) {
    const before = gapBefore(input.weekdays, i);
    const after = gapAfter(input.weekdays, i);
    if (before >= 2 && after >= 2) {
      plans[i] = { focus: ['full_body'], core: false, rationale: 'A rest day on each side, so a full-body session has time to recover.' };
      previousFocus = 'full_body';
      continue;
    }
    // Alternate Upper/Lower through each run of back-to-back days.
    const half: FocusKey = lastHalf === 'upper' ? 'lower' : 'upper';
    const other: FocusKey = half === 'upper' ? 'lower' : 'upper';
    plans[i] = {
      focus: [half],
      core: false,
      rationale:
        before === 1 && previousFocus !== null
          ? `${FOCUS_LABEL[half]}, the day after ${FOCUS_LABEL[previousFocus]}, so those muscles get a rest.`
          : `${FOCUS_LABEL[half]}, because the next day trains too and covers ${FOCUS_LABEL[other].toLowerCase()} body.`,
    };
    previousFocus = half;
    lastHalf = half;
  }

  return withCoreDefaults(plans);
}

/** FR-2.7: day plans when the user picks a named split instead of the recommendation. */
export function dayPlansForSplit(split: NamedSplitType, weekdays: readonly Weekday[]): DayPlan[] {
  if (split === 'full_body') {
    return withCoreDefaults(weekdays.map(() => ({ focus: ['full_body'], core: false, rationale: 'You chose full body.' })));
  }
  return withCoreDefaults(rotationPlans(split, weekdays, `You chose ${split === 'upper_lower' ? 'Upper/Lower' : 'Push/Pull/Legs'}.`));
}

/** The stored preference if well-formed for this many training days, else null (falls back to auto). */
export function validPlanPreferences(raw: unknown, dayCount: number): PlanPreferences | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { split, days } = raw as { split?: unknown; days?: unknown };
  if (split === 'auto' || split === 'full_body' || split === 'upper_lower' || split === 'push_pull_legs') {
    return { split };
  }
  if (split === 'custom' && Array.isArray(days) && days.length === dayCount) {
    const parsed = days.map(validDayPlan);
    if (parsed.every((d): d is DayPlan => d !== null)) return { split: 'custom', days: parsed };
  }
  return null;
}

/** FR-2.7: resolves the user's preference (or the recommendation) into one day plan per training weekday. */
export function resolveDayPlans(input: {
  preferences: PlanPreferences | null;
  goal: Goal;
  fitnessLevel: FitnessLevel;
  weekdays: readonly Weekday[];
}): { dayPlans: DayPlan[]; rule: PlanSplitPreference } {
  const prefs = input.preferences;
  if (prefs?.split === 'custom' && prefs.days && prefs.days.length === input.weekdays.length) {
    return { dayPlans: prefs.days.map((d) => ({ focus: d.focus, core: d.core })), rule: 'custom' };
  }
  if (prefs && prefs.split !== 'auto' && prefs.split !== 'custom') {
    return { dayPlans: dayPlansForSplit(prefs.split, input.weekdays), rule: prefs.split };
  }
  return { dayPlans: recommendDayPlans(input), rule: 'auto' };
}

/**
 * Pairs of back-to-back training days whose focuses share most of their
 * muscles, for the editor's (non-blocking) recovery warning.
 */
export function backToBackOverlaps(dayPlans: readonly DayPlan[], weekdays: readonly Weekday[], musclesOf: (plan: DayPlan) => string[]): number[] {
  const flagged: number[] = [];
  weekdays.forEach((_, i) => {
    if (weekdays.length < 2 || gapBefore(weekdays, i) !== 1) return;
    const prevIndex = (i - 1 + weekdays.length) % weekdays.length;
    const today = new Set(musclesOf(dayPlans[i]));
    const yesterday = musclesOf(dayPlans[prevIndex]);
    const shared = yesterday.filter((m) => today.has(m)).length;
    if (shared > 0 && shared >= Math.min(today.size, yesterday.length) / 2) flagged.push(i);
  });
  return flagged;
}
