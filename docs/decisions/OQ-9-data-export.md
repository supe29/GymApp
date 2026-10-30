# OQ-9: Data export capability (beyond deletion)

**Status:** Explicitly deferred past V1. `plan.md` flagged this as needing a product decision "before Phase 12 sign-off"; Phase 12's `docs/security-checklist.md` audit did not actually raise it — it was silently missed, not deferred. This document is the explicit deferral that should have happened then, written during Phase 13's final open-question pass specifically so it isn't left as a silent gap.

## Decision

**V1 ships account deletion (PR-4/AC-13) but no data export/download feature.** A user can remove their data; they cannot request a machine-readable copy of it before doing so. No export endpoint, UI, or format is designed or implemented in this phase.

## Rationale

- **Why defer instead of build?** Data export is a privacy-rights feature whose *required* scope is determined by PR-7 (regulatory/compliance posture — GDPR Article 20 portability, CCPA, etc.), which `docs/security-checklist.md` already records as "Open — not resolved here," explicitly dependent on target market/region (also carried as an open item in `spec.md` §11 and `intent.md`). Building an export feature now would mean guessing at a format and scope (JSON dump of which tables? human-readable PDF? on-demand or async email delivery?) that PR-7's eventual resolution could invalidate — e.g., GDPR portability has specific machine-readable-format requirements that a guessed implementation might not satisfy.
- **Why is this safe to defer rather than a compliance risk today?** No specific regulatory regime has been committed to for V1 (PR-7 is open), so there is no currently-active legal requirement this defers past its deadline. Deferring is a scope decision, not a known violation.
- **Why record this now instead of leaving it as PR-7's problem?** Phase 12 was supposed to either resolve this or explicitly defer it and didn't do either — this document closes that process gap so "data export" doesn't silently fall off the plan a second time.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Ship a minimal export (e.g., a JSON dump of the user's own rows) now | Would be built against an undefined compliance target; likely to need rework once PR-7 resolves, for a feature no current AC- requires. |
| Resolve PR-7 now to unblock a real decision | Out of scope for Phase 13 (and for this plan generally) — PR-7 depends on business/legal input on target market that hasn't been made, consistent with `intent.md`'s carried-forward open question on "data-privacy/compliance posture pending target market." |

## Consequences

- Data export remains unscoped for V1; it is tracked here as a known, explicitly-deferred gap rather than something a future reader has to rediscover.
- Whoever eventually resolves PR-7 should revisit this decision first — the export format/scope should be derived from PR-7's answer, not designed independently of it.
- `plan.md`'s Unresolved Questions table's OQ-9 row is marked deferred, pointing here.
