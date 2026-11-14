// Phase 5: deterministic split selection (spec.md FR-2.1, AC-1). Pure,
// synchronous, framework/backend-agnostic — same design as
// ../content/exerciseQueries.ts.

import type { FitnessLevel, Goal } from '../validation/profileValidation';
import { SPLIT_DAY_TEMPLATES } from './rules/splitDayTemplates';
import { SPLIT_RULES, type NamedSplitType } from './rules/splitRules';

export interface SplitSelectionInput {
  goal: Goal;
  fitnessLevel: FitnessLevel;
  trainingDaysPerWeek: number;
}

export interface SessionTemplate {
  /** 1-based position within the week. */
  dayOrder: number;
  /** e.g. "Upper A", "Push B" when a day template repeats within the week. */
  name: string;
  muscleGroupKeys: string[];
}

export interface SplitSelection {
  splitType: NamedSplitType;
  sessionTemplates: SessionTemplate[];
  /** NFR-7: which rule in SPLIT_RULES produced this selection. */
  splitRuleId: string;
}

function specificity(
  rule: { goal: Goal | 'any'; fitnessLevel: FitnessLevel | 'any' },
  input: SplitSelectionInput,
): number {
  let score = 0;
  if (rule.goal === input.goal) score += 1;
  if (rule.fitnessLevel === input.fitnessLevel) score += 1;
  return score;
}

/**
 * FR-2.1: resolve the training split deterministically from goal, fitness
 * level, and training days per week, then fill the week with that split's
 * day templates. Among SPLIT_RULES entries whose day range contains
 * trainingDaysPerWeek and whose goal/fitnessLevel match (exactly or via
 * 'any'), the most specific match wins (an exact goal/level match outranks
 * 'any'); ties break on earliest table order. Fully deterministic — the
 * same input always resolves to the same rule.
 */
export function selectSplit(input: SplitSelectionInput): SplitSelection {
  const candidates = SPLIT_RULES.filter(
    (rule) =>
      input.trainingDaysPerWeek >= rule.minDays &&
      input.trainingDaysPerWeek <= rule.maxDays &&
      (rule.goal === 'any' || rule.goal === input.goal) &&
      (rule.fitnessLevel === 'any' || rule.fitnessLevel === input.fitnessLevel),
  );

  if (candidates.length === 0) {
    throw new Error(
      `No split rule matches goal=${input.goal}, fitnessLevel=${input.fitnessLevel}, trainingDaysPerWeek=${input.trainingDaysPerWeek}.`,
    );
  }

  const bestRule = candidates.reduce((best, rule) =>
    specificity(rule, input) > specificity(best, input) ? rule : best,
  );

  const templates = SPLIT_DAY_TEMPLATES[bestRule.splitType];
  const needsRepeatSuffix = input.trainingDaysPerWeek > templates.length;
  const sessionTemplates: SessionTemplate[] = [];
  for (let i = 0; i < input.trainingDaysPerWeek; i += 1) {
    const template = templates[i % templates.length];
    const repeatIndex = Math.floor(i / templates.length);
    const suffix = needsRepeatSuffix ? ` ${String.fromCharCode(65 + repeatIndex)}` : '';
    sessionTemplates.push({
      dayOrder: i + 1,
      name: `${template.name}${suffix}`,
      muscleGroupKeys: template.primaryMuscleGroupKeys,
    });
  }

  return { splitType: bestRule.splitType, sessionTemplates, splitRuleId: bestRule.id };
}
