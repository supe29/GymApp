# OQ-3: Exact progressive-overload increment rule (FR-6.1, SR-4)

**Status:** Resolved in Phase 8, per `plan.md`'s own assignment ("Phase 8 ... resolves OQ-3") and
`spec.md`'s OQ-3 entry ("Exact progressive-overload rule (increment size, e.g., fixed +2.5kg vs.
percentage-based) is not yet defined").

## Decision

`packages/core/src/progression/evaluateSession.ts` implements a **double progression** rule,
driven by two fixed constants in `packages/core/src/progression/rules/incrementRules.ts`:
`WEIGHT_INCREMENT_KG = 2.5`, `REP_INCREMENT = 1`.

For each prescribed exercise, evaluated against the first `target_sets` logged sets by `set_index`:

1. **Any missed set** (reps below `target_reps_min`, a set never logged, or fewer than
   `target_sets` sets logged) → **hold**. Weight and reps stay at the current prescription. This
   is SR-4's literal requirement — checked first, and short-circuits every other branch.
2. **Full success** — every one of those sets reached the rep ceiling (`target_reps_max`, or
   `target_reps_min` when no max is set) — **and** a weight is tracked (`target_weight_kg` is not
   null) → suggest **+2.5 kg**, and reset the rep target back down to `target_reps_min` (the
   classic "add weight, drop back to the bottom of the rep range" pattern).
3. **Full success with no tracked weight** (a bodyweight exercise) → suggest **+1 rep** past the
   current ceiling instead, since weight progression isn't applicable.
4. **Partial success** — every set met the floor (`target_reps_min`) but not all reached the
   ceiling — → suggest **+1 rep** to the floor, weight untouched.

## Rationale

- **Why fixed `+2.5 kg` rather than percentage-based?** `+2.5 kg` is the smallest common
  barbell/dumbbell plate increment — simple, with no rounding or percentage-of-what-base-weight
  ambiguity, and it's exactly spec.md's own placeholder example. SR-4 requires "conservative
  increments"; a flat 2.5kg step is conservative across the full range of weights this app's users
  will plausibly lift (a 20kg squat and a 150kg squat both get the same small, safe nudge, rather
  than a percentage that could suggest an unreasonably large jump at high weights or a
  rounding-to-zero non-increment at very low weights).
- **Why double progression (reps first, then weight) rather than weight-only?** Spec.md's FR-6.1
  explicitly lists "weight increase, rep increase, or hold" as the three possible actions — a
  rule that only ever proposed weight changes would leave two of the three actions unreachable.
  Double progression is also the standard, widely-used pattern for exactly this scenario (a
  prescribed rep *range*, not a single number) and gives a natural, well-justified home to the
  "increase_reps" action: progress within the range before adding load.
- **Why does a full-success weight increase reset reps to the floor?** Adding weight while also
  expecting the user to still hit the ceiling reps would not be a "conservative" increment — it
  would compound two increases into one suggestion. Resetting to the floor makes the next
  occurrence's challenge purely the added weight, isolating one variable at a time.
- **Why does a bodyweight exercise get `+1 rep` instead of being held or using some other scheme?**
  `target_weight_kg` is `null` for bodyweight movements (per Phase 5's `planGenerator.ts`, which
  never invents a weight — AI-1). Falling back to "hold" for every successful bodyweight exercise
  would make progression impossible for that whole category, which spec.md's FR-6.1 doesn't carve
  out as an exception. Reusing the same `REP_INCREMENT` constant keeps exactly one tunable number
  for all rep-based suggestions, rather than inventing a second rep increment just for this case.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Percentage-based weight increment (e.g. +5%) | Scales unpredictably across the full range of plausible weights (too small to matter at low weights, too large to be "conservative" at high weights) — spec.md's own placeholder favored the fixed-amount option. |
| Weight-only progression (no rep-range double progression) | Leaves `increase_reps` and the prescribed rep *range* concept (Phase 5) functionally unused; doesn't fit a goal/level-scaled rep range at all. |
| +5 kg fixed increment | Considered and rejected in favor of the smaller, more universally "conservative" +2.5kg per SR-4's explicit wording. |

## Consequences

- `packages/core/src/progression/rules/incrementRules.ts`'s two constants are now settled inputs
  to the progression engine, not an open question for a later phase to re-litigate.
- `evaluateExercisePerformance`'s SR-4 regression test sweeps a wide combinatorial grid of
  per-set rep outcomes and asserts no fixture containing any missed set ever returns
  `increase_weight`/`increase_reps` — the concrete, testable form of this decision's safety
  constraint, not just a design intention.
- `spec.md`'s OQ-3 entry and `plan.md`'s Unresolved Questions table are marked resolved, pointing
  here.
