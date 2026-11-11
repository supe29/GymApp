import {
  backToBackOverlaps,
  dayPlansForSplit,
  recommendDayPlans,
  resolveDayPlans,
  validPlanPreferences,
} from './dayPlanner';
import { dayPlanMuscles, dayPlanName, validDayPlan } from './rules/dayFocus';
import type { Weekday } from './weekSchedule';

const focusOf = (plans: { focus: string[] }[]) => plans.map((p) => p.focus.join('+'));
const coreOf = (plans: { core: boolean }[]) => plans.map((p) => p.core);
const beginner = (weekdays: Weekday[]) => recommendDayPlans({ goal: 'general_fitness', fitnessLevel: 'beginner', weekdays });

describe('FR-2.7: recommendDayPlans', () => {
  test('spaced-out days (Mon/Wed/Fri) keep full-body sessions, which already include abs', () => {
    const plans = beginner([1, 3, 5]);
    expect(focusOf(plans)).toEqual(['full_body', 'full_body', 'full_body']);
    expect(coreOf(plans)).toEqual([false, false, false]);
    expect(plans[0].rationale).toContain('rest day on each side');
  });

  test('back-to-back days split into Upper/Lower so muscles rest (Mon/Tue/Thu/Fri)', () => {
    const plans = beginner([1, 2, 4, 5]);
    expect(focusOf(plans)).toEqual(['upper', 'lower', 'upper', 'lower']);
    expect(plans[1].rationale).toBe('Lower, the day after Upper, so those muscles get a rest.');
  });

  test('three days in a row alternate and never repeat a half on consecutive days', () => {
    expect(focusOf(beginner([1, 2, 3]))).toEqual(['upper', 'lower', 'upper']);
  });

  test('a weekend run wrapping into Monday starts after the longest rest (Sat/Sun/Mon)', () => {
    // Weekday order is Mon, Sat, Sun; the sequence runs Sat -> Sun -> Mon.
    expect(focusOf(beginner([1, 6, 7]))).toEqual(['upper', 'upper', 'lower']);
  });

  test('a mix: full body on a day with rest around it, halves on back-to-back days', () => {
    // Mon/Tue back to back, Fri on its own.
    expect(focusOf(beginner([1, 2, 5]))).toEqual(['upper', 'lower', 'full_body']);
  });

  test('core finisher on about every other day whose focus has no abs', () => {
    const plans = beginner([1, 2, 4, 5]); // Upper, Lower, Upper, Lower: only Upper days lack abs
    expect(coreOf(plans)).toEqual([true, false, false, false]);
  });

  test('Upper/Lower and Push/Pull/Legs users keep their rotation, starting after the longest rest', () => {
    const ul = recommendDayPlans({ goal: 'general_fitness', fitnessLevel: 'intermediate', weekdays: [1, 2, 4, 5] });
    expect(focusOf(ul)).toEqual(['upper', 'lower', 'upper', 'lower']);
    const ppl = recommendDayPlans({ goal: 'general_fitness', fitnessLevel: 'intermediate', weekdays: [1, 2, 3, 4, 5] });
    expect(focusOf(ppl)).toEqual(['push', 'pull', 'legs', 'push', 'pull']);
    // Push and Pull lack abs; core alternates across them.
    expect(coreOf(ppl)).toEqual([true, false, false, true, false]);
  });

  test('is deterministic', () => {
    expect(beginner([1, 2, 4, 5])).toEqual(beginner([1, 2, 4, 5]));
  });
});

describe('FR-2.7: dayPlansForSplit', () => {
  test('a chosen Push/Pull/Legs split rotates from the day after the longest rest', () => {
    expect(focusOf(dayPlansForSplit('push_pull_legs', [1, 3, 5]))).toEqual(['push', 'pull', 'legs']);
    expect(focusOf(dayPlansForSplit('push_pull_legs', [1, 6, 7]))).toEqual(['legs', 'push', 'pull']);
  });

  test('a chosen full-body split stays full body even on back-to-back days', () => {
    expect(focusOf(dayPlansForSplit('full_body', [1, 2]))).toEqual(['full_body', 'full_body']);
  });
});

describe('day plans: names, muscles, validation', () => {
  test('a combined "Pull + Legs + Core" day unites both muscle sets and leaves abs to the finisher', () => {
    const plan = { focus: ['pull', 'legs'] as const, core: true };
    expect(dayPlanName({ ...plan, focus: [...plan.focus] })).toBe('Pull + Legs + Core');
    const muscles = dayPlanMuscles({ ...plan, focus: [...plan.focus] });
    expect(muscles).toEqual(expect.arrayContaining(['lats', 'biceps', 'quadriceps', 'hamstrings']));
    expect(muscles).not.toContain('abdominals');
  });

  test('validDayPlan accepts 1-2 distinct known focuses', () => {
    expect(validDayPlan({ focus: ['push'], core: true })).toEqual({ focus: ['push'], core: true });
    expect(validDayPlan({ focus: [] })).toBeNull();
    expect(validDayPlan({ focus: ['push', 'push'] })).toBeNull();
    expect(validDayPlan({ focus: ['push', 'pull', 'legs'] })).toBeNull();
    expect(validDayPlan({ focus: ['cardio'] })).toBeNull();
  });

  test('validPlanPreferences checks custom days against the day count', () => {
    expect(validPlanPreferences({ split: 'push_pull_legs' }, 3)).toEqual({ split: 'push_pull_legs' });
    expect(validPlanPreferences({ split: 'custom', days: [{ focus: ['push'], core: true }] }, 2)).toBeNull();
    expect(validPlanPreferences({ split: 'weird' }, 3)).toBeNull();
    expect(validPlanPreferences(null, 3)).toBeNull();
  });
});

describe('resolveDayPlans', () => {
  const base = { goal: 'general_fitness' as const, fitnessLevel: 'beginner' as const, weekdays: [1, 2, 4, 5] as Weekday[] };

  test('no preference or auto -> recommendation', () => {
    expect(resolveDayPlans({ ...base, preferences: null }).rule).toBe('auto');
    expect(resolveDayPlans({ ...base, preferences: { split: 'auto' } }).rule).toBe('auto');
  });

  test('a named split -> its day plans', () => {
    const resolved = resolveDayPlans({ ...base, preferences: { split: 'push_pull_legs' } });
    expect(resolved.rule).toBe('push_pull_legs');
    expect(resolved.dayPlans).toHaveLength(4);
  });

  test('custom days are used as given', () => {
    const days = [
      { focus: ['push' as const], core: true },
      { focus: ['pull' as const, 'legs' as const], core: false },
      { focus: ['upper' as const], core: false },
      { focus: ['lower' as const], core: true },
    ];
    const resolved = resolveDayPlans({ ...base, preferences: { split: 'custom', days } });
    expect(resolved).toEqual({ dayPlans: days, rule: 'custom' });
  });
});

describe('backToBackOverlaps', () => {
  test('flags a back-to-back day sharing most muscles with the day before', () => {
    const fb = { focus: ['full_body' as const], core: false };
    expect(backToBackOverlaps([fb, fb], [1, 2], dayPlanMuscles)).toEqual([1]);
    expect(backToBackOverlaps([fb, fb], [1, 4], dayPlanMuscles)).toEqual([]);
    const upper = { focus: ['upper' as const], core: false };
    const lower = { focus: ['lower' as const], core: false };
    expect(backToBackOverlaps([upper, lower], [1, 2], dayPlanMuscles)).toEqual([]);
  });
});
