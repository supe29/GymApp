# OQ-6: Biological sex field — options and BMR formula branching

**Status:** Resolved in Phase 2, per plan.md's assignment ("OQ-6 ... Must resolve by: Phase 2").

## Decision

`profiles.biological_sex` is a three-value field: `male`, `female`, `prefer_not_to_say`. It is
**not** a free-text/self-describe field, and it is **not** reduced to a strict binary.

This is not a new schema decision — it confirms, and removes the "placeholder pending OQ-6"
status from, the value set already implemented in
`/supabase/migrations/0001_profiles.sql` during Phase 1.

BMR formula branching (Mifflin-St Jeor, per spec.md A-1), to be implemented in Phase 6:

- `male` → `10×weight_kg + 6.25×height_cm − 5×age + 5`
- `female` → `10×weight_kg + 6.25×height_cm − 5×age − 161`
- `prefer_not_to_say` → `10×weight_kg + 6.25×height_cm − 5×age − 78`
  (the arithmetic mean of the male (+5) and female (−161) constant terms: (5 + −161) / 2 = −78)

When the `prefer_not_to_say` branch is used, Phase 6 must disclose to the user (per NFR-7,
auditability) that this number is an estimate averaged across sexes because a specific value
wasn't provided, not a formula calibrated to their physiology. This is a UI/copy requirement on
Phase 6, not a Phase 2 deliverable — recorded here so it isn't lost.

## Rationale

- **Why not strict binary (male/female only)?** Mifflin-St Jeor is defined in terms of a binary
  sex term, and a strict binary would make the formula unambiguous. But forcing a choice on a
  field spec.md itself only added out of formula necessity (A-1: "`intent.md` did not explicitly
  list it, so it is added here as a necessary field") — not because the product has any other use
  for it — asks users to disclose more than the product needs from them. `intent.md`'s privacy
  constraint ("User health-adjacent data ... must be handled with care") argues for the least
  disclosure necessary, not the most convenient formula.
- **Why not a free-text/self-describe field?** That would be more inclusive in principle, but it
  turns a two-branch deterministic formula into an open-ended classification problem for Phase 6
  with no natural third (or fourth, or fifth) physiological constant to branch to — exactly the
  kind of unbounded complexity `intent.md`'s scope-discipline constraint ("V1 favors a simple,
  trustworthy core loop ... over breadth") argues against for a V1. A fixed third option that
  degrades gracefully to a documented estimate is the simplest mechanism that avoids forcing a
  binary disclosure.
- **Why is the averaged constant safe to ship?** SR-1's safety floor is a hard lower bound applied
  after the full TDEE/goal-adjustment calculation regardless of which BMR branch was used; the
  ±83 kcal/day spread between the male and female constants is small relative to that floor and to
  normal day-to-day intake variance, so defaulting to the midpoint for `prefer_not_to_say` does not
  introduce a safety risk on its own — SR-1 remains the actual backstop, as it does for both other
  branches.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Binary only (`male` / `female`) | Forces disclosure the product doesn't otherwise need; conflicts with the privacy-care constraint. |
| Free-text / self-describe | Turns a two-branch deterministic formula into unbounded classification; conflicts with V1 scope discipline. |
| `male` / `female` / `prefer_not_to_say` (chosen) | None — this is the shipped decision. |

## Consequences

- No schema migration change was required — `0001_profiles.sql`'s existing CHECK constraint
  already matches this decision; only its comment was updated to remove the "placeholder" framing.
- `packages/api-client/src/types/database.ts`'s `biological_sex` union type is already correct.
- Phase 6 (nutrition engine) must implement the third branch and its disclosure copy as described
  above; this is now a settled input to that phase, not an open question for it to re-litigate.
- A schema-level test now asserts the CHECK constraint accepts exactly these three values and
  rejects anything else (see `supabase/tests/adversarial.test.mjs`,
  "profiles.biological_sex CHECK constraint").
