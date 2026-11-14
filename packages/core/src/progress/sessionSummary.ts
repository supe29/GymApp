// FR-8.4: the post-session summary's facts. Every number shown in the
// summary (and every number the AI explanation may mention, AI-1/AI-5)
// comes from here: deterministic, pure, and computed from the session's
// confirmed set logs through the same SetLogEntry shape logAggregation.ts
// defines. `fallbackText` is the rule-based wording shown whenever the AI
// explanation is unavailable, so the summary is never blank.

import type { SetLogEntry } from '../logs/logAggregation';
import { PRESCRIPTION_RULES } from '../planning/rules/prescriptionRules';
import type { ProgressionAction } from '../progression/evaluateSession';
import { formatWeight, type UnitPreference } from '../units/weightConversion';
import { weightedSetsByMuscle } from './muscleCoverage';
import type { FitnessLevel, Goal } from '../validation/profileValidation';

export interface SummaryExerciseInput {
  exerciseId: string;
  name: string;
  /** 0 for freeform/added exercises (no prescription). */
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number | null;
  skipped: boolean;
  primaryMuscleKeys: readonly string[];
  secondaryMuscleKeys: readonly string[];
  mechanic?: string | null;
}

export interface SummaryProgressionInput {
  exerciseName: string;
  action: ProgressionAction;
  suggestedWeightKg: number | null;
  suggestedReps: number | null;
}

export interface SummaryNextSessionInput {
  name: string;
  exercises: { name: string; primaryMuscleKeys: readonly string[]; secondaryMuscleKeys: readonly string[] }[];
}

export interface SessionSummaryInput {
  sessionName: string;
  startedAt: string | null;
  completedAt: string;
  goal: Goal | null;
  fitnessLevel: FitnessLevel | null;
  unitPreference: UnitPreference;
  exercises: SummaryExerciseInput[];
  /** This session's confirmed set logs. */
  logs: SetLogEntry[];
  /** Earlier sessions' logs for the same exercises (for "vs last time"). */
  priorLogs: SetLogEntry[];
  /** muscle_groups.key -> display name. */
  muscleNames: Readonly<Record<string, string>>;
  newPrs: { exerciseName: string; repCount: number; weightKg: number }[];
  progression: SummaryProgressionInput[];
  nextSession: SummaryNextSessionInput | null;
}

export interface SummaryExercise {
  exerciseId: string;
  name: string;
  skipped: boolean;
  setsDone: number;
  targetSets: number;
  reps: number[];
  topWeightKg: number | null;
  volumeKg: number;
  /** Every prescribed set reached the rep floor; null when there was no prescription. */
  targetMet: boolean | null;
  /** This session's volume minus the last session's for this exercise; null with no history or no load. */
  volumeChangeKg: number | null;
}

export interface MuscleWorked {
  key: string;
  name: string;
  /** Sets counted with primary = 1, secondary = 0.5. */
  weightedSets: number;
}

export interface SummaryText {
  headline: string;
  whatYouDid: string;
  bodyImpact: string;
  goalImpact: string;
  nextSession: string;
}

export interface SessionSummary {
  sessionName: string;
  durationMinutes: number | null;
  totals: { sets: number; reps: number; volumeKg: number; volumeChangeKg: number | null };
  exercises: SummaryExercise[];
  musclesWorked: MuscleWorked[];
  /** For the 3D body: keys worked as a primary vs only as a secondary muscle. */
  bodyHighlight: { primary: string[]; secondary: string[] };
  goalFit: {
    goal: Goal | null;
    repRange: { min: number; max: number } | null;
    /** Whether any rep range (prescribed or the goal rule) applied to the working sets. */
    rangesApply: boolean;
    setsInRange: number;
    workingSets: number;
    compoundExercises: number;
    isolationExercises: number;
    allTargetsMet: boolean | null;
  };
  newPrs: SessionSummaryInput['newPrs'];
  progression: SummaryProgressionInput[];
  nextSession: {
    name: string;
    muscles: string[];
    /** Muscles worked hard today (primary) that the next session also trains as a primary. */
    overlapWithToday: string[];
  } | null;
  fallbackText: SummaryText;
}

const GOAL_LABEL: Record<Goal, string> = {
  strength: 'strength',
  muscle_gain: 'muscle gain',
  fat_loss: 'fat loss',
  general_fitness: 'general fitness',
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function setVolume(log: SetLogEntry): number {
  return (log.weightKg ?? 0) * (log.reps ?? 0);
}

function listNames(names: string[], max = 3): string {
  const shown = names.slice(0, max);
  if (shown.length <= 1) return shown.join('');
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** The most recent earlier session's volume for one exercise, or null with no loaded history. */
function lastTimeVolume(priorLogs: SetLogEntry[], exerciseId: string): number | null {
  const forExercise = priorLogs.filter((log) => log.exerciseId === exerciseId);
  if (forExercise.length === 0) return null;
  const latest = forExercise.reduce((a, b) => (Date.parse(a.loggedAt) >= Date.parse(b.loggedAt) ? a : b));
  return forExercise
    .filter((log) => log.workoutSessionId === latest.workoutSessionId)
    .reduce((sum, log) => sum + setVolume(log), 0);
}

export function buildSessionSummary(input: SessionSummaryInput): SessionSummary {
  const weight = (kg: number) => formatWeight(kg, input.unitPreference);

  const exercises: SummaryExercise[] = input.exercises.map((ex) => {
    const sets = input.logs.filter((log) => log.exerciseId === ex.exerciseId);
    const weights = sets.map((s) => s.weightKg).filter((w): w is number => w !== null && w > 0);
    const volumeKg = round1(sets.reduce((sum, log) => sum + setVolume(log), 0));
    const previous = lastTimeVolume(input.priorLogs, ex.exerciseId);
    const prescribed = sets.slice(0, ex.targetSets);
    return {
      exerciseId: ex.exerciseId,
      name: ex.name,
      skipped: ex.skipped || sets.length === 0,
      setsDone: sets.length,
      targetSets: ex.targetSets,
      reps: sets.map((s) => s.reps ?? 0),
      topWeightKg: weights.length > 0 ? Math.max(...weights) : null,
      volumeKg,
      targetMet:
        ex.targetSets > 0
          ? prescribed.length >= ex.targetSets && prescribed.every((s) => (s.reps ?? 0) >= ex.targetRepsMin)
          : null,
      volumeChangeKg: previous !== null && previous > 0 && volumeKg > 0 ? round1(volumeKg - previous) : null,
    };
  });

  const done = exercises.filter((ex) => !ex.skipped);
  const totalSets = done.reduce((n, ex) => n + ex.setsDone, 0);
  const totalReps = done.reduce((n, ex) => n + ex.reps.reduce((a, b) => a + b, 0), 0);
  const totalVolume = round1(done.reduce((n, ex) => n + ex.volumeKg, 0));
  const changes = done.map((ex) => ex.volumeChangeKg).filter((c): c is number => c !== null);
  const totalChange = changes.length > 0 ? round1(changes.reduce((a, b) => a + b, 0)) : null;

  // Muscles: set-weighted, primary 1, secondary 0.5.
  const withSets = input.exercises.map((ex) => ({
    sets: exercises.find((e) => e.exerciseId === ex.exerciseId)?.setsDone ?? 0,
    primaryMuscleKeys: ex.primaryMuscleKeys,
    secondaryMuscleKeys: ex.secondaryMuscleKeys,
  }));
  const weighted = weightedSetsByMuscle(withSets);
  const primaryKeys = new Set(withSets.filter((ex) => ex.sets > 0).flatMap((ex) => ex.primaryMuscleKeys));
  const musclesWorked: MuscleWorked[] = [...weighted.entries()]
    .map(([key, weightedSets]) => ({ key, name: input.muscleNames[key] ?? key, weightedSets }))
    .sort((a, b) => b.weightedSets - a.weightedSets || a.name.localeCompare(b.name));
  const bodyHighlight = {
    primary: [...primaryKeys],
    secondary: [...weighted.keys()].filter((key) => !primaryKeys.has(key)),
  };

  // Goal fit. Each set is measured against its own exercise's prescribed
  // rep range (the plan may differ from the generic rule once regenerated
  // or progressed); freeform/added exercises fall back to the planner's
  // rule for the user's goal and level.
  const rule =
    input.goal && input.fitnessLevel
      ? PRESCRIPTION_RULES.find((r) => r.goal === input.goal && r.fitnessLevel === input.fitnessLevel)
      : undefined;
  const rangeFor = (exerciseId: string): { min: number; max: number } | null => {
    const ex = input.exercises.find((e) => e.exerciseId === exerciseId);
    if (ex && ex.targetSets > 0) return { min: ex.targetRepsMin, max: ex.targetRepsMax ?? ex.targetRepsMin };
    return rule ? { min: rule.targetRepsMin, max: rule.targetRepsMax } : null;
  };
  const workingSets = input.logs.filter((log) => (log.reps ?? 0) > 0 && done.some((ex) => ex.exerciseId === log.exerciseId));
  const ranges = workingSets.map((log) => rangeFor(log.exerciseId));
  const setsInRange = workingSets.filter((log, i) => {
    const range = ranges[i];
    return range !== null && (log.reps ?? 0) >= range.min && (log.reps ?? 0) <= range.max;
  }).length;
  const usedRanges = [...new Set(ranges.filter((r): r is { min: number; max: number } => r !== null).map((r) => `${r.min}-${r.max}`))];
  const commonRange =
    usedRanges.length === 1 ? { min: Number(usedRanges[0].split('-')[0]), max: Number(usedRanges[0].split('-')[1]) } : null;
  const mechanics = input.exercises.filter((ex) => done.some((d) => d.exerciseId === ex.exerciseId));
  const prescribedDone = done.filter((ex) => ex.targetMet !== null);
  const goalFit = {
    goal: input.goal,
    /** The one rep range every working set was measured against, or null when they differ (or none applies). */
    repRange: commonRange,
    rangesApply: usedRanges.length > 0,
    setsInRange,
    workingSets: workingSets.length,
    compoundExercises: mechanics.filter((ex) => ex.mechanic === 'compound').length,
    isolationExercises: mechanics.filter((ex) => ex.mechanic === 'isolation').length,
    allTargetsMet: prescribedDone.length > 0 ? prescribedDone.every((ex) => ex.targetMet) : null,
  };

  // Next session.
  let nextSession: SessionSummary['nextSession'] = null;
  if (input.nextSession) {
    const nextPrimary = new Set(input.nextSession.exercises.flatMap((ex) => ex.primaryMuscleKeys));
    const nextAll = [...new Set(input.nextSession.exercises.flatMap((ex) => [...ex.primaryMuscleKeys, ...ex.secondaryMuscleKeys]))];
    nextSession = {
      name: input.nextSession.name,
      muscles: nextAll.map((key) => input.muscleNames[key] ?? key),
      overlapWithToday: [...primaryKeys].filter((key) => nextPrimary.has(key)).map((key) => input.muscleNames[key] ?? key),
    };
  }

  const durationMinutes =
    input.startedAt !== null
      ? Math.max(0, Math.round((Date.parse(input.completedAt) - Date.parse(input.startedAt)) / 60000))
      : null;

  const summary: Omit<SessionSummary, 'fallbackText'> = {
    sessionName: input.sessionName,
    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
    totals: { sets: totalSets, reps: totalReps, volumeKg: totalVolume, volumeChangeKg: totalChange },
    exercises,
    musclesWorked,
    bodyHighlight,
    goalFit,
    newPrs: input.newPrs,
    progression: input.progression,
    nextSession,
  };

  return { ...summary, fallbackText: buildFallbackText(summary, weight) };
}

function buildFallbackText(s: Omit<SessionSummary, 'fallbackText'>, weight: (kg: number) => string): SummaryText {
  const done = s.exercises.filter((ex) => !ex.skipped);
  const skipped = s.exercises.filter((ex) => ex.skipped);

  const headline =
    s.newPrs.length > 0
      ? `${s.sessionName} done, with ${s.newPrs.length === 1 ? 'a new personal record' : `${s.newPrs.length} new personal records`}.`
      : s.goalFit.allTargetsMet
        ? `${s.sessionName} done. You hit every target.`
        : `${s.sessionName} done.`;

  const volumePart =
    s.totals.volumeKg > 0
      ? ` and moved ${weight(s.totals.volumeKg)} in total${
          s.totals.volumeChangeKg !== null && s.totals.volumeChangeKg !== 0
            ? ` (${s.totals.volumeChangeKg > 0 ? '+' : '−'}${weight(Math.abs(s.totals.volumeChangeKg))} vs last time)`
            : ''
        }`
      : '';
  const whatYouDid =
    done.length === 0
      ? 'No sets were logged this session.'
      : `You did ${s.totals.sets} sets across ${done.length} ${done.length === 1 ? 'exercise' : 'exercises'}${volumePart}.${
          skipped.length > 0 ? ` Skipped: ${listNames(skipped.map((ex) => ex.name))}.` : ''
        }`;

  const top = s.musclesWorked.slice(0, 3).map((m) => m.name.toLowerCase());
  const bodyImpact =
    top.length === 0
      ? 'No muscles were worked this session.'
      : `Most of the work went to your ${listNames(top)}${
          s.musclesWorked.length > 3 ? `, with ${s.musclesWorked.length - 3} more muscle groups helping` : ''
        }.`;

  let goalImpact: string;
  const { goal, repRange, rangesApply, setsInRange, workingSets, compoundExercises } = s.goalFit;
  if (!goal || !rangesApply || workingSets === 0) {
    goalImpact = 'Showing up and logging your sets is what makes progress measurable over time.';
  } else {
    const fit = repRange
      ? `${setsInRange} of ${workingSets} sets were in the ${repRange.min}–${repRange.max} reps range your plan uses for ${GOAL_LABEL[goal]}.`
      : `${setsInRange} of ${workingSets} sets were inside the rep ranges your plan sets for ${GOAL_LABEL[goal]}.`;
    const why: Record<Goal, string> = {
      strength: 'Heavier sets in a lower rep range train your body to produce more force, which is what builds strength.',
      muscle_gain: 'Steady sets in a moderate rep range, done close to effort, are what drive muscle growth over the coming weeks.',
      fat_loss: 'Keeping the reps up keeps the session demanding, and regular strength work helps you hold on to muscle while you lose fat.',
      general_fitness: 'A mix of moderate sets across your whole body builds all-round strength and keeps training sustainable.',
    };
    const compound = compoundExercises > 0 ? ` ${compoundExercises} compound ${compoundExercises === 1 ? 'lift' : 'lifts'} worked several muscles at once.` : '';
    const consistency = s.goalFit.allTargetsMet
      ? ' Because you met every target, your plan can step up next time.'
      : s.goalFit.allTargetsMet === false
        ? ' Not every target was met, so your plan holds steady where needed rather than adding load.'
        : '';
    goalImpact = `${fit} ${why[goal]}${compound}${consistency}`;
  }

  let nextSession: string;
  if (!s.nextSession) {
    nextSession = 'Pick your next workout from your plan when you are ready.';
  } else {
    const recovery =
      s.nextSession.overlapWithToday.length > 0
        ? ` It trains your ${listNames(s.nextSession.overlapWithToday.map((m) => m.toLowerCase()))} again, so give them a day or two of rest first.`
        : top.length > 0
          ? ` It works different muscles, so your ${listNames(top)} get time to recover.`
          : '';
    const changes = s.progression
      .filter((p) => p.action !== 'hold')
      .map((p) =>
        p.action === 'increase_weight' && p.suggestedWeightKg !== null
          ? `${p.exerciseName} up to ${weight(p.suggestedWeightKg)}`
          : p.suggestedReps !== null
            ? `${p.exerciseName} up to ${p.suggestedReps} reps`
            : null,
      )
      .filter((c): c is string => c !== null);
    nextSession = `Next up: ${s.nextSession.name}.${recovery}${changes.length > 0 ? ` Suggested changes: ${listNames(changes, 4)}.` : ''}`;
  }

  return { headline, whatYouDid, bodyImpact, goalImpact, nextSession };
}

/**
 * AI-5: the only data sent to the AI explanation. Compact, already in the
 * user's units (so every number the AI may repeat appears here verbatim),
 * and free of personal identifiers: no name, email, age or body weight.
 */
export interface SessionAiFacts {
  goal: string | null;
  fitnessLevel: FitnessLevel | null;
  session: string;
  durationMinutes: number | null;
  totals: { sets: number; reps: number; volume: string | null; volumeVsLastTime: string | null };
  exercises: {
    name: string;
    skipped: boolean;
    sets: number;
    targetSets: number | null;
    reps: number[];
    topWeight: string | null;
    targetMet: boolean | null;
    volumeVsLastTime: string | null;
  }[];
  musclesWorked: { name: string; weightedSets: number }[];
  goalFit: {
    repRange: string | null;
    rangesApply: boolean;
    setsInRange: number;
    workingSets: number;
    compoundExercises: number;
    isolationExercises: number;
    allTargetsMet: boolean | null;
  };
  newPersonalRecords: string[];
  suggestedChanges: string[];
  nextSession: { name: string; muscles: string[]; sharesMusclesWithToday: string[] } | null;
}

export function toAiFacts(summary: SessionSummary, unitPreference: UnitPreference, fitnessLevel: FitnessLevel | null): SessionAiFacts {
  const weight = (kg: number) => formatWeight(kg, unitPreference);
  const signed = (kg: number | null) => (kg === null || kg === 0 ? null : `${kg > 0 ? '+' : '-'}${weight(Math.abs(kg))}`);
  return {
    goal: summary.goalFit.goal ? GOAL_LABEL[summary.goalFit.goal] : null,
    fitnessLevel,
    session: summary.sessionName,
    durationMinutes: summary.durationMinutes,
    totals: {
      sets: summary.totals.sets,
      reps: summary.totals.reps,
      volume: summary.totals.volumeKg > 0 ? weight(summary.totals.volumeKg) : null,
      volumeVsLastTime: signed(summary.totals.volumeChangeKg),
    },
    exercises: summary.exercises.map((ex) => ({
      name: ex.name,
      skipped: ex.skipped,
      sets: ex.setsDone,
      targetSets: ex.targetSets > 0 ? ex.targetSets : null,
      reps: ex.reps,
      topWeight: ex.topWeightKg !== null ? weight(ex.topWeightKg) : null,
      targetMet: ex.targetMet,
      volumeVsLastTime: signed(ex.volumeChangeKg),
    })),
    musclesWorked: summary.musclesWorked.map((m) => ({ name: m.name, weightedSets: m.weightedSets })),
    goalFit: {
      repRange: summary.goalFit.repRange ? `${summary.goalFit.repRange.min}-${summary.goalFit.repRange.max} reps` : null,
      rangesApply: summary.goalFit.rangesApply,
      setsInRange: summary.goalFit.setsInRange,
      workingSets: summary.goalFit.workingSets,
      compoundExercises: summary.goalFit.compoundExercises,
      isolationExercises: summary.goalFit.isolationExercises,
      allTargetsMet: summary.goalFit.allTargetsMet,
    },
    newPersonalRecords: summary.newPrs.map((pr) => `${pr.exerciseName}: ${pr.repCount} reps at ${weight(pr.weightKg)}`),
    suggestedChanges: summary.progression.map((p) =>
      p.action === 'increase_weight' && p.suggestedWeightKg !== null
        ? `${p.exerciseName}: increase to ${weight(p.suggestedWeightKg)}`
        : p.action === 'increase_reps' && p.suggestedReps !== null
          ? `${p.exerciseName}: increase to ${p.suggestedReps} reps`
          : `${p.exerciseName}: keep the same load`,
    ),
    nextSession: summary.nextSession
      ? { name: summary.nextSession.name, muscles: summary.nextSession.muscles, sharesMusclesWithToday: summary.nextSession.overlapWithToday }
      : null,
  };
}
