# OQ-12: Allow-list of fields for external barcode/food lookups, and logging retention

**Status:** Explicitly deferred past V1 (not resolved). `docs/privacy/external-lookup-data-flow.md` already flagged this as open and unresolved when Phase 9 shipped; this document is the formal sign-off that deferral — rather than leaving it ambiguously flagged — per Phase 13's mandate to close out every open question one way or the other.

## Decision

**Not resolved; formally deferred until a real external food/barcode source is actually integrated.** Per `docs/licensing/go-no-go-checklist.md`, Phase 9 shipped against a hand-authored placeholder dataset seeded directly into this app's own `food_items` table — there are currently **zero external network calls** in this feature. `docs/privacy/external-lookup-data-flow.md` already documents the baseline contract any future real integration must satisfy (search query or barcode digits only; never user-identifying fields; no per-user auth token in the third-party request), but does not pin down the *exact* allow-list or a specific log-retention period, because there is no real third-party integration yet to write that contract against concretely.

## Rationale

- **Why defer rather than specify exact values now?** The precise allow-list and retention period are properties of whichever real third-party API eventually gets integrated (its request schema, its own logging/ToS requirements) and of PR-7's eventual compliance posture (a stricter future compliance stance could require a narrower allow-list or shorter retention than the baseline minimal contract already documented). Specifying exact values against neither a real API nor a decided compliance posture would be inventing numbers with nothing to validate them against.
- **Why is deferring safe rather than a current gap?** Nothing today sends data externally — `foodSearch.ts`/`barcodeLookup.ts` only query this app's own Supabase table (per `external-lookup-data-flow.md`). PR-5 ("no selling/sharing personal data; external lookups avoid PII") is satisfied vacuously because there is no external transmission to violate it. The gap only becomes live the moment a real integration is wired up, which is exactly when `external-lookup-data-flow.md` already says OQ-12 must be resolved "before wiring up a real external source" — this document doesn't change that gate, it just records that the gate was deliberately left closed rather than overlooked.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Pin down an exact allow-list and retention period now, speculatively | Would be guessing at both a specific third-party API's constraints and PR-7's unresolved compliance posture; likely to need rework once either is actually decided. |
| Treat the baseline contract in `external-lookup-data-flow.md` as sufficient and consider OQ-12 closed | That document itself explicitly says it does not resolve OQ-12 — closing it here without adding anything would misrepresent an unresolved question as resolved, which is exactly what Phase 13's final pass is supposed to prevent. |

## Consequences

- Before any real external food/barcode source is wired up, whoever does that work must first write the exact allow-list and retention-period decision (as its own update to this document or `external-lookup-data-flow.md`), per the gate that document already establishes.
- `plan.md`'s Unresolved Questions table's OQ-12 row is marked explicitly deferred, pointing here.
