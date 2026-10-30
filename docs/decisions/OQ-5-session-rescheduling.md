# OQ-5: Rescheduling behavior for missed/skipped planned sessions

**Status:** Explicitly deferred past V1. `plan.md` allowed this outcome directly ("must resolve by Phase 5 or explicitly deferred past V1"); Phase 5 shipped a deliberately narrower behavior instead of full rescheduling semantics, and this document is the formal sign-off that was missing until Phase 13's final open-question pass.

## Decision

**No calendar-day mapping or missed/skipped-day handling ships in V1.** A planned session's position is a simple `dayOrder` within the plan, with no `effective_from`-style date attached. `packages/core/src/planning/nextSessionSelector.ts`'s `determineNextPlannedSession` always returns the lowest-`dayOrder` session not yet marked complete, cycling back to day 1 once every session in the plan has been completed at least once. There is no concept of "this was supposed to happen last Tuesday" anywhere in the system — a user who skips a day simply does the next incomplete session whenever they next open the app, with no gap, no makeup-day logic, and no explicit "missed" state surfaced anywhere.

## Rationale

- **Why defer rather than build it?** A-5 already flagged that "exact rescheduling behavior is an open question," and the honest answer is that resolving it properly requires product decisions this plan never made: does a missed day shift everything forward by one, get silently skipped, or get flagged for catch-up? None of spec.md's AC- criteria or user flows (2.1–2.7) depend on a specific answer — flow 2.2 only requires *a* next session to be presented, not date-accurate scheduling. Building speculative rescheduling logic against an undecided product requirement would risk the wrong behavior being load-bearing by the time it's revisited.
- **Why is "always serve the next incomplete session, cycling on completion" an acceptable placeholder?** It satisfies every literal requirement that currently exists (UX-3's dashboard needs *a* next session; AC-6/AC-7 only care about evaluation after a session is logged, not when) without inventing unreviewed calendar semantics, and it degrades gracefully — a user who trains inconsistently still always gets a sensible next workout, just without date-awareness.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Fixed weekly calendar mapping (plan's Monday always maps to calendar Monday) | Requires deciding missed-day behavior (skip vs. shift vs. flag) with no spec guidance, and no AC- currently tests for it — would be unreviewed, invented scope. |
| Push remaining sessions forward on any gap (per A-5's "pushes remaining sessions" wording) | Same problem: A-5 describes this as the *assumed* default but spec.md's own OQ-5 entry says the exact behavior is still open; implementing A-5 literally would be resolving the open question without the explicit decision review this file provides. |

## Consequences

- `nextSessionSelector.ts`'s current cycling behavior is confirmed as the intended V1 behavior, not a stopgap awaiting a follow-up patch — any future rescheduling feature is new scope, not a bug fix.
- If a future release needs date-aware scheduling, it starts from this decision record, not from assuming the current behavior was accidental.
- `plan.md`'s Unresolved Questions table's OQ-5 row is marked deferred, pointing here.
