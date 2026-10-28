// Phase 5: FR-2.4/DR-5 plan diffing for the "regenerate now?" preview
// summary. This module deliberately does NOT compute plan_version numbers
// or supersession timestamps — those are owned exclusively by the DB
// trigger chain (supabase/migrations/0009_plan_target_versioning.sql),
// which auto-assigns plan_version on insert and auto-supersedes the prior
// row. versioning.ts's only job is a DB-agnostic comparable plan shape and
// a structural diff between two such shapes, for display before the user
// accepts or declines a regeneration.

import type { GeneratedPlan } from './planGenerator';
import type { SplitType } from './rules/splitRules';

export interface ComparableExercise {
  exerciseId: string;
  exerciseName: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
}

export interface ComparableSession {
  dayOrder: number;
  name: string;
  exercises: ComparableExercise[];
}

export interface ComparablePlan {
  splitType: SplitType;
  sessions: ComparableSession[];
}

/** Converts a freshly generated plan into the shape diffPlans compares. */
export function toComparablePlan(plan: GeneratedPlan): ComparablePlan {
  return {
    splitType: plan.splitType,
    sessions: plan.sessions.map((session) => ({
      dayOrder: session.dayOrder,
      name: session.name,
      exercises: session.exercises.map((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        targetSets: ex.targetSets,
        targetRepsMin: ex.targetRepsMin,
        targetRepsMax: ex.targetRepsMax,
      })),
    })),
  };
}

export type SessionChangeType = 'added' | 'removed' | 'unchanged' | 'modified';
export type ExerciseChangeType = 'added' | 'removed' | 'unchanged' | 'prescription_changed';

export interface ExerciseDiffEntry {
  exerciseId: string;
  exerciseName: string;
  changeType: ExerciseChangeType;
  previous?: Pick<ComparableExercise, 'targetSets' | 'targetRepsMin' | 'targetRepsMax'>;
  next?: Pick<ComparableExercise, 'targetSets' | 'targetRepsMin' | 'targetRepsMax'>;
}

export interface SessionDiffEntry {
  dayOrder: number;
  name: string;
  changeType: SessionChangeType;
  exerciseChanges: ExerciseDiffEntry[];
}

export interface PlanDiffSummary {
  splitTypeChanged: boolean;
  previousSplitType: SplitType;
  nextSplitType: SplitType;
  sessionDiffs: SessionDiffEntry[];
  summaryCounts: {
    sessionsAdded: number;
    sessionsRemoved: number;
    exercisesAdded: number;
    exercisesRemoved: number;
    prescriptionsChanged: number;
  };
}

function prescriptionEquals(a: ComparableExercise, b: ComparableExercise): boolean {
  return a.targetSets === b.targetSets && a.targetRepsMin === b.targetRepsMin && a.targetRepsMax === b.targetRepsMax;
}

function diffExercises(
  previous: ComparableExercise[],
  next: ComparableExercise[],
): ExerciseDiffEntry[] {
  const previousById = new Map(previous.map((e) => [e.exerciseId, e]));
  const nextById = new Map(next.map((e) => [e.exerciseId, e]));
  const entries: ExerciseDiffEntry[] = [];

  for (const ex of next) {
    const prior = previousById.get(ex.exerciseId);
    if (!prior) {
      entries.push({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, changeType: 'added', next: ex });
    } else if (!prescriptionEquals(prior, ex)) {
      entries.push({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        changeType: 'prescription_changed',
        previous: prior,
        next: ex,
      });
    } else {
      entries.push({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, changeType: 'unchanged', previous: prior, next: ex });
    }
  }
  for (const ex of previous) {
    if (!nextById.has(ex.exerciseId)) {
      entries.push({ exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, changeType: 'removed', previous: ex });
    }
  }
  return entries;
}

/**
 * FR-2.4/DR-5: structural diff between the currently active plan and a
 * freshly generated candidate, matched by dayOrder (sessions) and
 * exerciseId (exercises). Pure comparison only — never computes a
 * plan_version number.
 */
export function diffPlans(previous: ComparablePlan, next: ComparablePlan): PlanDiffSummary {
  const previousByDay = new Map(previous.sessions.map((s) => [s.dayOrder, s]));
  const nextByDay = new Map(next.sessions.map((s) => [s.dayOrder, s]));
  const sessionDiffs: SessionDiffEntry[] = [];

  let sessionsAdded = 0;
  let sessionsRemoved = 0;
  let exercisesAdded = 0;
  let exercisesRemoved = 0;
  let prescriptionsChanged = 0;

  for (const session of next.sessions) {
    const prior = previousByDay.get(session.dayOrder);
    if (!prior) {
      sessionsAdded += 1;
      const exerciseChanges = session.exercises.map<ExerciseDiffEntry>((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        changeType: 'added',
        next: ex,
      }));
      exercisesAdded += exerciseChanges.length;
      sessionDiffs.push({ dayOrder: session.dayOrder, name: session.name, changeType: 'added', exerciseChanges });
      continue;
    }

    const exerciseChanges = diffExercises(prior.exercises, session.exercises);
    for (const change of exerciseChanges) {
      if (change.changeType === 'added') exercisesAdded += 1;
      if (change.changeType === 'removed') exercisesRemoved += 1;
      if (change.changeType === 'prescription_changed') prescriptionsChanged += 1;
    }
    const sessionChanged = prior.name !== session.name || exerciseChanges.some((c) => c.changeType !== 'unchanged');
    sessionDiffs.push({
      dayOrder: session.dayOrder,
      name: session.name,
      changeType: sessionChanged ? 'modified' : 'unchanged',
      exerciseChanges,
    });
  }

  for (const session of previous.sessions) {
    if (!nextByDay.has(session.dayOrder)) {
      sessionsRemoved += 1;
      const exerciseChanges = session.exercises.map<ExerciseDiffEntry>((ex) => ({
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName,
        changeType: 'removed',
        previous: ex,
      }));
      exercisesRemoved += exerciseChanges.length;
      sessionDiffs.push({ dayOrder: session.dayOrder, name: session.name, changeType: 'removed', exerciseChanges });
    }
  }

  sessionDiffs.sort((a, b) => a.dayOrder - b.dayOrder);

  return {
    splitTypeChanged: previous.splitType !== next.splitType,
    previousSplitType: previous.splitType,
    nextSplitType: next.splitType,
    sessionDiffs,
    summaryCounts: { sessionsAdded, sessionsRemoved, exercisesAdded, exercisesRemoved, prescriptionsChanged },
  };
}
