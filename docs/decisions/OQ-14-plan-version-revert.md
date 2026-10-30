# OQ-14: Reverting to a superseded plan_version/target_version

**Status:** Resolved in Phase 13 (final open-question pass). Genuinely unaddressed until now — no code, comment, or prior decision doc touched this question; `packages/api-client/src/plans.ts`/`nutrition.ts` only ever moved versions forward.

## Decision

**Forward-only. There is no user-facing revert/rollback to a superseded `plan_version` or `target_version`.** When a user declines a regeneration prompt (AC-3), the existing version simply stays active — nothing changes. When a user accepts regeneration, a new version is created and the prior one is superseded (`superseded_at` set) per DR-5; `superseded_at` is never unset, and no API exists to make an older version active again. The only way to return to a configuration resembling an older version is to re-edit the profile fields back and regenerate again, producing a *new* version with the same values — not a restoration of the old row.

## Rationale

- **Why forward-only rather than supporting revert?** DR-5's versioning exists to keep historical logs correctly attributed to the plan/targets that were active when they were logged — a read-side guarantee. Revert is a write-side feature (make an old version active again) that DR-5 doesn't require and no AC- criterion tests for. Adding it means deciding non-trivial semantics with no spec guidance: does reverting create a new version pointing at old values (safe, consistent with "versions are never mutated") or reactivate the literal old row (breaks the invariant that a `superseded_at` version is permanently historical)? Neither answer is demanded by any requirement, so building either would be unreviewed scope.
- **Why is forward-only acceptable rather than a usability gap?** The spec's only version-related user flow (2.7, Plan Update) describes edit → prompt → regenerate-or-decline, with no "undo a past regeneration" step. A user who regrets a regeneration can always re-edit their profile back to the prior values and regenerate again, which is slower than a one-click revert but requires zero new code and no new invariant.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Reactivate an old version row by clearing its `superseded_at` | Breaks DR-5's implicit invariant that a superseded version is permanently historical once superseded — any code elsewhere that assumes "the row with `superseded_at = null` is the newest" would need auditing for this new case. |
| "Revert" as a new version copying an old version's field values | Technically safer (no mutation of history) but still an unscoped, unrequested feature with its own UI/API surface — nothing in spec.md asks for it. |

## Consequences

- `plans.ts`/`nutrition.ts`'s versioning remains exactly as implemented: insert-new, supersede-prior, never un-supersede.
- If a future release wants revert, it should be designed as "create a new version from an old version's values," not as reactivating historical rows, to preserve DR-5's invariant.
- `plan.md`'s Unresolved Questions table's OQ-14 row is marked resolved, pointing here.
