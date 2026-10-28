# OQ-1: Safe-minimum calorie floor (SR-1), and OQ-8: unsafe-configuration warning thresholds (SR-2)

**Status:** Resolved in Phase 6, per plan.md's assignment ("Phase 6 ... resolves OQ-1") and the
Unresolved Questions table's assignment of OQ-8 to Phase 6.

## Decision (OQ-1 — SR-1 floor values)

`packages/core/src/nutrition/safetyLimits.ts`'s `SEX_CALORIE_FLOORS` fixes the safe-minimum daily
calorie floor at:

- `female` → 1200 kcal/day
- `male` → 1500 kcal/day
- `prefer_not_to_say` → **1500 kcal/day** (the higher, safer of the two sex-specific floors — not
  an average)

These are spec.md's own placeholder reference values (SR-1: "not below ~1200 kcal/day for women or
~1500 kcal/day for men"), adopted as final rather than re-derived from a separate external
reference, since they already match widely-cited general safe-minimum guidance for unsupervised
calorie restriction and spec.md explicitly offered them as the intended baseline pending
confirmation.

For `prefer_not_to_say`, the floor uses the **higher** value (1500), not the arithmetic mean
(1350, which would mirror OQ-6's BMR-constant approach). This is a deliberate asymmetry between
OQ-1 and OQ-6: OQ-6's averaged BMR constant only shifts the *computed* calorie number by a small,
bounded amount, with SR-1's floor remaining the actual safety backstop regardless of which BMR
branch ran. OQ-1's floor *is* that backstop — averaging it would mean a floor that is, by
construction, sometimes wrong in the unsafe direction for users whose actual physiology would
have required the higher (male) floor. When the safety mechanism itself is the thing being set,
and sex is unknown, this decision picks the value that is never unsafe over the value that is
unsafe approximately half the time.

The floor is enforced unconditionally in `macroCalculator.ts`'s `calculateCalorieTarget` —
`dailyCalories = max(goalAdjustedCalories, floor)` — with no code path that can produce a lower
number, verified by adversarial tests covering extreme low-TDEE inputs across all three
`biologicalSex` values (`packages/core/src/nutrition/macroCalculator.test.ts`,
`nutritionGenerator.test.ts`).

## Decision (OQ-8 — SR-2 unsafe-configuration warning)

`checkUnsafeConfiguration` in the same file is **non-blocking**: generation always proceeds (the
SR-1 floor still clamps the number), matching SR-2's "must not permit ... without **at minimum**
surfacing a warning" — a warning is the floor requirement, not a block, so this decision takes the
minimum bar rather than the more restrictive (blocking) option.

A warning is surfaced when either:

1. `goal === 'fat_loss'` **and** `trainingDaysPerWeek >= 6` — spec.md's own named example of an
   unsafe configuration ("extreme simultaneous aggressive deficit + high training volume"), taken
   literally as the trigger condition.
2. The goal-adjusted calorie target, **before** the SR-1 floor clamps it, falls more than 300 kcal
   below the applicable floor — i.e., the user's inputs alone (independent of training volume)
   would have produced a target the floor had to meaningfully correct.

Both conditions can fire independently or together (in which case the warning text names both).
300 kcal was chosen as a materiality threshold so the warning doesn't fire on trivial floor-adjacent
cases (e.g. a pre-clamp value only 50 kcal under the floor), which would make the warning noisy and
reduce its signal value for genuinely extreme configurations.

The warning string itself is advisory, never persisted (the `nutrition_targets` schema has no
column for it — see Consequences below), and is surfaced to the user at the moment the candidate
is generated (regeneration preview, or — implicitly — initial generation), matching NFR-7's intent
that the system explain itself to the user, not just silently self-correct.

## Rationale

- **Why adopt spec.md's placeholder values as final rather than citing a named external source?**
  spec.md already frames these numbers as the intended target ("a widely-accepted baseline"),
  pending only "confirmation." Phase 6 confirms them as specified rather than substituting a
  different reference's numbers, since spec.md's own values are a reasonable, commonly-cited
  general safe-minimum guideline and introducing a different source's numbers would silently
  change the product's already-stated intent rather than resolve the open question as asked.
- **Why not block generation under SR-2?** Blocking would mean some goal/profile combinations
  produce *no* targets at all, which conflicts with AC-1's "a workout plan and nutrition targets
  are generated ... without further input" and FR-3's unconditional generation requirement. A
  non-blocking warning satisfies SR-2's literal "at minimum" wording while preserving AC-1.
- **Why these exact OQ-8 thresholds and not others?** No external numeric standard was named by
  spec.md for OQ-8 (unlike OQ-1, which had placeholder numbers); the thresholds here are therefore
  an explicit implementation decision, deliberately conservative and simple (two independently
  checkable conditions) rather than a more elaborate risk model, consistent with `intent.md`'s V1
  scope-discipline constraint.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Average the two sex-specific floors for `prefer_not_to_say` (1350, mirroring OQ-6) | The floor is the safety mechanism itself; averaging it would make it unsafe for roughly half of users with unknown sex. |
| Block generation when SR-2's condition is met | Conflicts with AC-1/FR-3's unconditional-generation requirement; spec.md's "at minimum" wording only requires a warning. |
| Re-derive SR-1 floor values from a different named external source | Would silently diverge from spec.md's own stated intent rather than resolving it as written. |

## Consequences

- No schema migration was required or made — `nutrition_targets` (migration `0006`) has no column
  for the SR-2 warning string, so it is never persisted; it is recomputed from the same
  deterministic inputs at generation/regeneration-preview time and shown to the user in the UI
  layer (`NutritionTargetsScreen.tsx`'s warning banner, and `EditProfileScreen.tsx`'s combined
  regeneration flow via the same preview path) rather than stored.
- `packages/core/src/nutrition/safetyLimits.ts`'s `SEX_CALORIE_FLOORS` and
  `HIGH_TRAINING_VOLUME_DAYS_THRESHOLD`/`UNSAFE_DEFICIT_MARGIN_KCAL` constants are now settled
  inputs to the nutrition engine, not open questions for a later phase to re-litigate.
- Adversarial tests assert the floor cannot be breached under extreme inputs for all three
  `biologicalSex` values (`macroCalculator.test.ts`, `nutritionGenerator.test.ts`), and both SR-2
  trigger conditions — together and independently — have dedicated regression fixtures
  (`safetyLimits.test.ts`).
