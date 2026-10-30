// Phase 11: a pure, minimal "what's next" selector for the dashboard
// (UX-3). Deliberately does not attempt OQ-5's full rescheduling semantics
// (missed/skipped-session handling, calendar-day mapping) — this app has
// no concept of "today" for a plan, only a fixed day-order sequence. Picks
// the first session not yet completed, cycling back to day 1 once every
// session in the plan has been done at least once.

export interface PlanSessionSummary {
  id: string;
  dayOrder: number;
}

/** UX-3: the next planned session to do, by day order, or null for an empty plan. */
export function determineNextPlannedSession<T extends PlanSessionSummary>(
  sessions: T[],
  completedPlannedSessionIds: Set<string>,
): T | null {
  if (sessions.length === 0) return null;

  const byDayOrder = [...sessions].sort((a, b) => a.dayOrder - b.dayOrder);
  const nextIncomplete = byDayOrder.find((session) => !completedPlannedSessionIds.has(session.id));
  return nextIncomplete ?? byDayOrder[0];
}
