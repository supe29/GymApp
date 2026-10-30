# OQ-4: PR calculation method (FR-8.2)

**Status:** Resolved in Phase 10, per `plan.md`'s own assignment ("resolves OQ-4") and
`spec.md`'s OQ-4 entry ("PR calculation method (raw heaviest set vs. estimated 1RM formula) is
not yet defined").

## Decision

`packages/core/src/progress/prCalculator.ts` treats a personal record as **the heaviest weight
ever lifted for a specific rep count**, tracked independently per `(exercise_id, rep_count)`
bucket — not a single estimated-one-rep-max (1RM) number per exercise.

- `deriveNewPersonalRecords(sessionLogs, priorLogs)` compares the best (heaviest) set per bucket
  logged in a just-completed session against the best weight ever logged for that same bucket in
  every prior session. A strictly heavier weight is a new PR; a tie is a near-miss, not a record.
- Estimated 1RM is still computed (`calculateEstimatedOneRepMax`, the Epley formula:
  `weight × (1 + reps / 30)`) and stored on every PR row (`personal_records.estimated_one_rm`),
  but only as **supplementary context** shown alongside the primary heaviest-weight metric — never
  the thing compared to decide whether something is a new record.

## Rationale

- **Why heaviest-weight-per-rep-bucket rather than a single 1RM number?** AC-11's own wording is
  "logs a new heaviest set for an exercise... the PR for that exercise updates" — the acceptance
  criterion is written against the literal heaviest-set definition, not an estimated 1RM. The
  `personal_records` migration (0007) comment makes the same framing explicit: "current PR" is
  "max weight_kg grouped by (user_id, exercise_id, rep_count)," not a derived 1RM.
- **Why keep estimated 1RM at all?** It is genuinely useful context for comparing performance
  across different rep counts (e.g. "is my new 8-rep PR actually a better lift than my 5-rep PR?"),
  and the schema already reserves a column for it (`estimated_one_rm`, nullable) — storing it costs
  nothing and gives `PersonalRecordsScreen.tsx`/`NewPersonalRecordCard.tsx` a secondary data point
  without making it load-bearing for the "is this a new record" decision.
- **Why is a 1RM-only approach rejected?** 1RM formulas (Epley and similar) are estimates that
  degrade badly at high rep counts (10+ reps) and are meaningless for most bodyweight exercises
  (`target_weight_kg`/`weight_kg` is `null` — there is no weight to extrapolate from). Collapsing
  every rep count to one estimated number would silently misrepresent high-rep and bodyweight
  training entirely, and would conflict with the schema's own rep-bucket design.
- **Why strictly greater, not greater-or-equal?** A tie means the user matched their best, not
  exceeded it — treating a tie as a "new" record would be misleading, and the plan's own test list
  explicitly calls out "ties and near-misses" as a case to get right.
- **Why only the single heaviest set per bucket per session, not every qualifying set?** If a
  session logs multiple sets at the same rep count, only the best one actually represents that
  session's result for the bucket; inserting one `personal_records` row per set would create
  redundant, confusing history for a single session's performance.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Estimated 1RM as the single PR metric per exercise | Unreliable at high rep counts, undefined for bodyweight exercises, conflicts with the schema's rep-bucket design, and doesn't match AC-11's literal wording. |
| Greater-or-equal (ties count as new PRs) | A tie is matching a prior best, not exceeding it — would misrepresent "near-misses" as records, which the plan's test list explicitly flags as a case to handle correctly. |
| Recording every qualifying set in a session, not just the heaviest per bucket | Produces redundant/confusing history rows for what is really one result per bucket per session. |

## Consequences

- `packages/core/src/progress/prCalculator.ts`'s bucket-based comparison is now a settled input to
  PR derivation, not an open question for a later phase to re-litigate.
- `deriveNewPersonalRecords`'s test suite covers exact-tie, lower-weight, multiple-sets-same-bucket,
  bodyweight (no PR), and no-prior-history cases — the concrete, testable form of this decision.
- `spec.md`'s OQ-4 entry and `plan.md`'s Unresolved Questions table are marked resolved, pointing
  here.
