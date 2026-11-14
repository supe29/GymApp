# Day-focus planning: weekday-aware split, user override, core finisher (FR-2.7)

**Status:** Decided. It builds on OQ-5's resolution (training weekdays, FR-2.5).

## Decision

1. **Recommended by default, from the weekday spacing.** The FR-2.1 rule table (`splitRules.ts`) still picks the base split from goal × level × days per week. `recommendDayPlans` (`packages/core/src/planning/dayPlanner.ts`) then adapts it to the chosen weekdays:
   - **Full-body family:**
     - a day with a rest day on each side stays full body
     - back-to-back days alternate Upper / Lower
   - **Upper/Lower and Push/Pull/Legs:** keep rotating.
   - **Where the sequence starts:** both families start on the day after the longest rest. The alternation then never wraps onto itself, for example Sun → Mon, unless every day is a training day.
   - Each recommended day carries a one-line reason (NFR-7).
2. **The user can change it.** They can pick a named split, or set each day's focus: one or two of Full Body / Upper / Lower / Push / Pull / Legs, for example "Pull + Legs".
   - Two focuses interleave their muscle lists, so a session capped at N exercises covers both instead of filling up on the first.
   - Back-to-back days that share most muscles get a warning, but the choice is the user's.
   - Stored as `profiles.plan_preferences` (migration 0012). If it's invalid, or the custom days don't match the day count, it falls back to the recommendation. Custom days are cleared when the number of training days changes.
3. **Core finisher per day.** "+ Core" adds dedicated ab exercises after the normal session (1 for beginners, 2 otherwise). They go through the same selection, SR-3 gating and SR-6 equipment filter as every other slot. By default it's on for about every other day whose focus doesn't already train abs.
4. **Changes go through regeneration.** A new split or day plan is previewed with the existing FR-2.4 diff and, on accept, becomes a new plan version (DR-5). Past logs stay attributed to the plan they were logged against.
   - `acceptPlanWithPreferences` saves the preference, then creates the version. If creating the version fails, it restores the previous preference.
   - Changing the weekdays offers the same preview.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Edit exercises per day directly, with no regeneration | It would bypass versioning (DR-5) and the SR-3/SR-6 rules that selection enforces. |
| Fully manual days only | The user asked for a smart default. Most users never customise, so a sensible recommendation matters more. |
| Use the weekday spacing to choose the split itself (override FR-2.1) | It would silently discard the goal/level rules. Adapting within the chosen family keeps FR-2.1's intent. |

## Consequences

- `workout_plans.split_type` gains `'custom'`, for weeks that mix focuses. Its session size matches Upper/Lower (`sessionComposition.ts`).
- Users without chosen weekdays get exactly the previous behaviour.
