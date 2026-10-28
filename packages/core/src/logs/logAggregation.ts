// Phase 7: shared, pure read layer over Set Log history (spec.md NFR-4).
// Framework- and backend-agnostic by design, same as
// ../content/exerciseQueries.ts — operates on an already-fetched,
// denormalized array; the actual Supabase query is a packages/api-client
// concern (packages/api-client/src/workoutSessions.ts).
//
// Phase 8's progressive-overload evaluation and Phase 10's PR derivation
// must both read session history exclusively through this module rather
// than independently querying/aggregating raw logs, so the two can never
// diverge on the same underlying data (NFR-4). Deliberately contains no
// evaluation/rule logic of its own — those are Phase 8/10's job; this
// module only filters, groups, and sorts.

export interface SetLogEntry {
  id: string;
  workoutSessionId: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  loggedAt: string;
}

export interface WorkoutSessionSummary {
  id: string;
  plannedSessionId: string | null;
  workoutPlanId: string | null;
  status: 'in_progress' | 'completed';
  startedAt: string;
  completedAt: string | null;
}

/** FR-5.1/NFR-4: set logs belonging to a given exercise. */
export function filterByExercise(logs: SetLogEntry[], exerciseId: string): SetLogEntry[] {
  return logs.filter((log) => log.exerciseId === exerciseId);
}

/** FR-5.1/NFR-4: set logs belonging to a given workout session. */
export function filterBySession(logs: SetLogEntry[], workoutSessionId: string): SetLogEntry[] {
  return logs.filter((log) => log.workoutSessionId === workoutSessionId);
}

/** NFR-4: set logs grouped by their owning workout session. */
export function groupBySession(logs: SetLogEntry[]): Map<string, SetLogEntry[]> {
  const groups = new Map<string, SetLogEntry[]>();
  for (const log of logs) {
    const list = groups.get(log.workoutSessionId) ?? [];
    list.push(log);
    groups.set(log.workoutSessionId, list);
  }
  return groups;
}

/** NFR-4: set logs sorted chronologically (oldest first). */
export function sortByLoggedAt(logs: SetLogEntry[]): SetLogEntry[] {
  return [...logs].sort((a, b) => Date.parse(a.loggedAt) - Date.parse(b.loggedAt));
}

/**
 * NFR-4: the set logs for `exerciseId` from the most recent COMPLETED
 * session that logged it — the exact shape Phase 8's per-exercise
 * progression evaluation and Phase 10's PR derivation both need ("what
 * did the user do last time they trained this exercise"). Returns an
 * empty array if no completed session ever logged this exercise.
 * Sessions are ranked by completedAt; a session with no completedAt is
 * never considered (completed sessions always have one).
 */
export function mostRecentCompletedSessionLogs(
  logs: SetLogEntry[],
  sessions: WorkoutSessionSummary[],
  exerciseId: string,
): SetLogEntry[] {
  const exerciseLogs = filterByExercise(logs, exerciseId);
  const sessionIdsWithExercise = new Set(exerciseLogs.map((log) => log.workoutSessionId));

  const candidateSessions = sessions.filter(
    (session) =>
      session.status === 'completed' &&
      session.completedAt !== null &&
      sessionIdsWithExercise.has(session.id),
  );

  if (candidateSessions.length === 0) {
    return [];
  }

  const mostRecent = candidateSessions.reduce((latest, session) =>
    Date.parse(session.completedAt as string) > Date.parse(latest.completedAt as string) ? session : latest,
  );

  return sortByLoggedAt(filterBySession(exerciseLogs, mostRecent.id));
}
