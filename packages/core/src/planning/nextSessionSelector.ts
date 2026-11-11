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

/**
 * UX-3: the next planned session to do, given the most recently completed
 * planned session. Walks the fixed day-order sequence and wraps back to
 * day 1 after the last day, so the dashboard keeps rotating through the
 * plan rather than sticking on day 1 once every session has been done.
 * Returns the first session when nothing has been completed yet, or when
 * the last completed session belongs to an older plan version (DR-5). It
 * still does not handle missed or skipped days (OQ-5 remains open).
 */
export function determineNextPlannedSessionAfter<T extends PlanSessionSummary>(
  sessions: T[],
  lastCompletedPlannedSessionId: string | null,
): T | null {
  if (sessions.length === 0) return null;

  const byDayOrder = [...sessions].sort((a, b) => a.dayOrder - b.dayOrder);
  const lastIndex = lastCompletedPlannedSessionId
    ? byDayOrder.findIndex((session) => session.id === lastCompletedPlannedSessionId)
    : -1;
  if (lastIndex === -1) return byDayOrder[0];
  return byDayOrder[(lastIndex + 1) % byDayOrder.length];
}
