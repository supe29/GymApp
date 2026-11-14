// Phase 11: a pure, minimal "what's next" selector for the dashboard
// (UX-3), by day order only. Since OQ-5 was resolved, a user who has
// picked training weekdays gets date-aware scheduling and missed-day
// handling from ./weekSchedule.ts instead; these selectors are the
// fallback for a user who hasn't picked weekdays yet.

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
 * the last completed session belongs to an older plan version (DR-5).
 * Used when no training weekdays are chosen; with them, weekSchedule.ts
 * decides what's next and handles missed days (FR-2.5/FR-2.6).
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
