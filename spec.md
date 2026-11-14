# Spec: AI Fitness Coach

Derived from `intent.md`. This document specifies *what* the V1 product must do and how it must behave. It does not select technologies, frameworks, or infrastructure, and it does not describe implementation — that belongs to a later architecture/implementation stage.

---

## 1. Functional Requirements

### 1.1 User Profile & Onboarding
- FR-1.1: A new user must create a profile capturing: age, height, weight, biological sex (needed for calorie-formula accuracy — see Assumptions), fitness level (beginner / intermediate / advanced), a single primary goal (fat loss, muscle gain, strength improvement, or general fitness), training days per week, and available equipment.
- FR-1.2: Available equipment must be captured as a granular checklist of individual items, grouped by category (e.g., Free weights, Machines, Bodyweight/other), with one-tap presets ("Full gym," "Bodyweight only") that pre-check the underlying items.
- FR-1.3: Profile fields must be editable after account creation at any time.
- FR-1.4: Editing any field that affects plan generation (weight, goal, equipment, training days, fitness level) must prompt the user to regenerate their workout and/or nutrition plan; regeneration is not automatic/silent.

### 1.2 Workout Plan Generation
- FR-2.1: On profile completion, the system must generate a workout plan consisting of a training split (e.g., full-body, upper/lower, push/pull/legs) selected deterministically from goal, fitness level, and training days per week. Once training weekdays are chosen, this remains the base split that FR-2.7 adapts per day.
- FR-2.2: Each planned session must be filled with exercises drawn from the exercise library, filtered to only exercises compatible with the user's declared equipment.
- FR-2.3: Each prescribed exercise must specify target sets, reps, and (where applicable) starting weight/intensity guidance appropriate to the user's fitness level.
- FR-2.4: The plan must be re-generatable on demand by the user, and automatically proposed for regeneration when a plan-affecting profile field changes (FR-1.4).
- FR-2.5: The user must be able to choose the weekdays they train on (exactly as many as their training days per week). The plan is then shown week by week, day by day (and as a month calendar, FR-2.8): plan day N falls on the Nth chosen weekday, with rest days in between, and each session shows its exercises and its status (done, today, upcoming, missed, skipped, merged). A session counts as done if it was completed on any day of that week. Until weekdays are chosen, the plan is shown as its day-ordered list.
- FR-2.6: When a scheduled session's day has passed without it being done, the system must flag it as missed and suggest what to do, ranked by fixed rules with a plain-language reason: do it on a free day (today if possible, moving today's session to a later free day if needed), merge it into the next session if the combined session stays at 8 exercises or fewer, or skip it. The user chooses; nothing is moved automatically, and any choice can be undone. A missed session the user never resolves stays missed for that week only.
- FR-2.7: Each training day's focus (which muscle groups, and so which exercises) must suit the user's chosen weekdays. By default the system recommends it deterministically from the base split (FR-2.1) and the weekday spacing: a day with a rest day on each side may be full body, and back-to-back days get different focuses (e.g. Upper then Lower) so muscle groups get a rest day; each recommended day states why. The user may instead pick a named split (full body, upper/lower, push/pull/legs) or set each day's focus (one or two of Full Body, Upper, Lower, Push, Pull, Legs, e.g. "Pull + Legs"), and may add a core finisher (dedicated ab exercises at the end) to any day; by default it is on for about every other day that does not already train abs. Back-to-back days that share most muscles get a non-blocking warning. Any change is previewed and applied through FR-2.4 regeneration as a new plan version (DR-5); exercise selection, beginner safety (SR-3) and equipment rules (SR-6) are unchanged.
- FR-2.8: Once training weekdays are chosen, the user must be able to switch the plan between a week view (the FR-2.5 day-by-day list) and a month view, and move to earlier and later weeks and months. The month view is a Monday-first calendar: each training day shows its focus (the session name) and its status (done, today, upcoming, missed, skipped), rest days are blank, and tapping a day opens its week. Past weeks show the sessions completed in them as done, whatever their age, and a workout logged on a day with no scheduled session is still marked. Days before the current plan version took effect are not attributed to it (DR-5): they show no planned session, only workouts logged then. Only the current week offers missed-session options, undo and starting a session (FR-2.6); other weeks are read-only.

### 1.3 Nutrition Plan Generation
- FR-3.1: On profile completion, the system must generate daily calorie and macronutrient (protein/carbs/fat) targets, computed deterministically from the user's profile and goal.
- FR-3.2: Generated calorie targets must never fall below a defined safe minimum threshold (see Safety Requirements, SR-1).
- FR-3.3: The system must not generate specific meals or recipes — only daily numeric targets.

### 1.4 3D Muscle Model
- FR-4.1: The app must render an interactive 3D human body model with distinct, selectable regions corresponding to major muscle groups.
- FR-4.2: Selecting a muscle group must display a list of exercises in the library that target it (primary or secondary).
- FR-4.3: Viewing an exercise (from any part of the app) must indicate which muscle group(s) it targets, consistent with the 3D model's taxonomy.
- FR-4.4: The model must be usable on both web and mobile with equivalent functionality (rotate/zoom, select region, view exercise list).

### 1.5 Workout Logging
- FR-5.1: A user must be able to log a workout session: for each exercise, log one or more sets with weight and reps (and optionally RPE).
- FR-5.2: A logged session may be attached to a planned session (pre-filled with prescribed exercises, editable) or created freeform with no plan attached.
- FR-5.3: Within a session, the user must be able to add exercises not in the prescribed plan, skip a prescribed exercise, or substitute one exercise for another.
- FR-5.4: The app must offer a rest timer between logged sets.
- FR-5.5: Completed sessions must be persisted and viewable in a workout history.

### 1.6 Progressive Overload / Plan Adaptation
- FR-6.1: After a logged session, the system must evaluate performance per exercise against its prescription and, for the next scheduled occurrence of that exercise, propose an adjustment (weight increase, rep increase, or hold) using a defined, deterministic rule (see Assumptions for the specific rule).
- FR-6.2: Adjustment suggestions must be visible to the user before the next session, and the user must be able to accept, decline, or manually override the suggested value.
- FR-6.3: The rationale for a suggested adjustment must be shown in plain language (e.g., "You hit all reps last time, so we increased the weight").

### 1.7 Food Logging
- FR-7.1: A user must be able to log a food entry by searching a food database, scanning a barcode, or entering a custom food manually.
- FR-7.2: Each food entry must record calories and macros for the logged portion, attributed to a specific day and meal (breakfast/lunch/dinner/snack).
- FR-7.3: The app must display running daily totals against the user's calorie/macro targets.
- FR-7.4: If a scanned barcode is not found in the data source, the user must be able to fall back to manual search or manual entry.

### 1.8 Progress Tracking
- FR-8.1: A user must be able to log body weight entries over time and view them as a trend chart.
- FR-8.2: The system must automatically derive and surface personal records (heaviest weight for a given rep count, or estimated one-rep max) per exercise from workout logs, without manual entry.
- FR-8.3: Progress views must be accessible from a dedicated section of the app, not buried in workout/nutrition logging screens.
- FR-8.4: After every completed session (plan-attached or freeform), the system must show a session summary: what was done (sets, reps, top weight and volume per exercise, with the change vs the previous session), which muscles it worked, how it fits the user's goal (sets inside the goal's prescribed rep range, targets met), new PRs, and the next planned session with its progression changes. All facts in the summary are computed deterministically; any explanatory prose is subject to AI-5.
- FR-8.5: The progress section must include a per-day body progress view, opening on today, where the user can step back to earlier days.
  - For the chosen day it shows, for each muscle group, the work done against the work planned, as weighted sets. The weighting is the same as FR-8.4: a set counts 1 for each primary muscle and 0.5 for each secondary muscle.
  - Each muscle shows its done and planned sets, the sets left, and a percent capped at 100. The view also shows an overall percent of the day's planned work done; work beyond a muscle's target doesn't raise it.
  - The day's plan is the plan-attached session(s) logged that day, using the plan version actually followed (DR-5). If none were logged, it is the session(s) the weekly schedule puts on that date (FR-2.5).
  - Muscles worked outside the plan are listed separately as extra work. On a day with no plan, only the work done is shown, with no percent.
  - The 3D model (FR-4.x) is tinted per region in proportion to these values. The same data is shown as a list, which is also the non-visual fallback.
  - Every value is computed deterministically (AI-1).

### 1.9 Authentication & Account Management
- FR-9.1: A user must be able to create an account and sign in via email/password, Google, or Apple.
- FR-9.2: A user must be able to reset a forgotten password.
- FR-9.3: A user must be able to delete their account, which deletes their personal data (see Privacy Requirements, PR-4).
- FR-9.4: No guest/anonymous mode is provided; all app functionality requires a signed-in account.

---

## 2. User Flows

### 2.1 Sign Up & Onboarding
1. User opens app → chooses "Sign up" → signs up via email/password, Google, or Apple.
2. User is guided through profile creation: basic info → fitness level → goal → training days/week → equipment checklist.
3. System generates initial workout plan and nutrition targets.
4. User is shown a summary of their plan and targets, and lands on the home/dashboard screen.

### 2.2 First Workout Session (Plan-Attached)
1. User opens today's planned session from the dashboard.
2. For each prescribed exercise, user logs sets (weight, reps), optionally using the rest timer between sets.
3. User may add, skip, or substitute exercises mid-session.
4. User marks session complete.
5. System evaluates performance and stores progression suggestions for next occurrence of each exercise; any new PRs are surfaced.

### 2.3 Freeform Workout Session
1. User selects "Start freeform workout" (no plan attached).
2. User adds exercises and logs sets as in 2.2.
3. User marks session complete; session is stored in history but not evaluated against a prescribed plan.

### 2.4 Muscle Exploration
1. User opens the 3D model view.
2. User rotates/zooms the model and taps a muscle region.
3. System displays a list of exercises targeting that muscle group, filtered by the user's available equipment.
4. User may view exercise detail (instructions, targeted muscles) or add it to a session.

### 2.5 Food Logging
1. User opens the nutrition/diary screen for the current day.
2. User selects a meal slot and chooses to search, scan a barcode, or add a custom food.
3. User confirms portion size; entry is added to the day's log.
4. Daily totals update against calorie/macro targets.

### 2.6 Progress Review
1. User opens the progress section, which opens on today's body progress (FR-8.5): the 3D model tinted by how much of each muscle's planned work is done, the overall percent, and what is left. They can step back to earlier days.
2. User views weight trend chart (with ability to log a new weight entry).
3. User views a list of exercises with current PRs and PR history.

### 2.7 Plan Update (Profile Change)
1. User edits a plan-affecting profile field (e.g., changes goal from "muscle gain" to "fat loss").
2. System prompts: "This affects your plan — regenerate now?"
3. If accepted, system regenerates workout plan and/or nutrition targets and shows a summary of what changed.

---

## 3. Non-Functional Requirements

- NFR-1 (Consistency): Core functionality (profile, plan generation, logging, 3D model, progress) must be available with equivalent behavior on both web and mobile — no feature exclusive to one platform in V1.
- NFR-2 (Performance): The 3D muscle model must load and become interactive within a few seconds on a typical modern phone or laptop; muscle selection must respond without perceptible lag.
- NFR-3 (Connectivity): The app requires an active connection for core functionality; brief connectivity drops during workout logging must not silently discard already-entered sets.
- NFR-4 (Data integrity): Progressive-overload suggestions and PRs must be computed consistently from the same underlying log data — no divergent calculations across screens.
- NFR-5 (Accessibility): Screens must meet baseline accessibility practice (adequate contrast, readable text sizes, screen-reader-friendly labels on non-3D UI); the 3D model itself may rely on visual interaction but must have a non-visual fallback (e.g., a plain list of muscle groups) for users who cannot use it.
- NFR-6 (Content maintainability): The exercise and food data must be structured so the underlying content (exercise list, muscle tagging, food entries) can be corrected or extended without a full app release.
- NFR-7 (Auditability): Generated plans and nutrition targets must be explainable — the system must be able to show which inputs (profile fields) produced a given number, for user trust and for debugging.

---

## 4. Data Requirements

### 4.1 Core Entities (conceptual, not a schema)
- **User Profile**: identity, age, height, weight (current), biological sex, fitness level, goal, training days/week, equipment list, unit preference.
- **Equipment Item**: a single piece of equipment a user may own; grouped by category.
- **Muscle Group**: one of the fixed set of selectable regions in the 3D model.
- **Exercise**: name, instructions, primary/secondary muscle group(s), required equipment, difficulty.
- **Workout Plan**: a generated split, containing one or more **Planned Sessions**, each with prescribed exercises, sets, reps, and target weight/intensity guidance.
- **Workout Session (log)**: a completed or in-progress logged session, optionally linked to a Planned Session; contains **Set Logs** (exercise, weight, reps, RPE, timestamp).
- **Progression Suggestion**: per exercise, the system's next-prescription recommendation and the rule/rationale that produced it.
- **Personal Record**: per exercise, the best logged performance to date (and its history), derived from Set Logs.
- **Nutrition Target**: daily calorie/macro targets tied to a profile state (recalculated when the profile changes).
- **Food Item**: a food/product with calorie and macro values per unit portion, sourced from an external dataset or user-created.
- **Food Log Entry**: a Food Item, portion, meal slot, and day, linked to a user.
- **Weight Entry**: a user's logged body weight at a point in time.

### 4.2 Data Provenance
- DR-1: The exercise library is seeded from an external open dataset and re-tagged to the app's own muscle-group taxonomy; the app does not depend on that dataset being queried live at runtime.
- DR-2: The food database is composed of external food data sources (generic foods and barcode-scannable packaged products) supplemented by user-created custom foods; user-created foods are private to the user who created them unless a later feature decides otherwise (open question).
- DR-3: All user-generated data (logs, profile, weight entries) is owned by and scoped to the individual user; no cross-user visibility exists in V1 (no social features).

### 4.3 Data Lifecycle
- DR-4: Deleting an account must delete or irreversibly anonymize all personal data (profile, logs, weight entries) associated with it, excluding aggregate data that cannot be traced back to the user, if any is kept.
- DR-5: Editing a profile field that feeds nutrition/workout generation must version or timestamp the resulting targets/plan so historical logs remain attributable to the plan that was active when they were logged.
- DR-6: Chosen training weekdays are part of the user's profile and are cleared when the number of training days per week changes. Missed-session choices (skip, move to a date, merge into another session) are user-owned records tied to the plan version and week they were made in, and are removed with the account (DR-4).

---

## 5. UX Requirements

- UX-1: Onboarding must be completable in one sitting, in a linear guided flow, with progress indication (e.g., step X of Y).
- UX-2: The equipment checklist must support fast entry via presets, with granular editing available without extra navigation depth.
- UX-3: The dashboard/home screen must surface, at a glance: today's planned session (if any), progress toward today's nutrition targets, and quick access to logging.
- UX-4: Workout logging must be usable one-handed / glanceable, since it is used mid-workout in a gym context (large tap targets, minimal text entry, numeric steppers over typing where practical).
- UX-5: The 3D model must be discoverable from both the exercise browser (muscle context on any exercise) and as its own explorable section, not hidden behind an unrelated flow.
- UX-6: Progression suggestions and PR achievements must be surfaced proactively at the moment they're relevant (e.g., end of session, or start of the next session for that exercise), not only on a stats screen the user must remember to check.
- UX-7: Food logging must minimize manual entry friction — barcode scan and search must be the primary paths, manual macro entry the fallback.
- UX-8: All numeric health inputs/outputs (weight, calories, macros) must respect the user's chosen unit system consistently across the app.
- UX-9: Empty states (no workouts logged yet, no weight entries yet, etc.) must guide the user to the first action rather than showing a blank screen.

---

## 6. Privacy & Security Requirements

- PR-1: The app collects health-adjacent personal data (age, height, weight, fitness goal, body-related logs). This data must be accessible only to the account owner; no other user or unauthenticated request may read it.
- PR-2: Authentication must use secure, industry-standard practices for credential storage and session handling (no plaintext password storage; secure session/token handling for social login).
- PR-3: The app must have a privacy policy disclosing what data is collected, why, and how it is used, presented to the user before or during account creation.
- PR-4: Users must be able to request account and data deletion from within the app (see DR-4); deletion requests must be honored, not merely deactivated/hidden.
- PR-5: The app must not sell or share personal user data with third parties for advertising or unrelated purposes. External data lookups (e.g., barcode/food lookups) must not transmit personally identifying user information as part of the lookup where avoidable.
- PR-6: Data-in-transit must be encrypted (HTTPS/TLS) for all client-server communication.
- PR-7: The specific regulatory compliance posture (e.g., GDPR data-subject rights, data residency) is dependent on target market and is an open question (carried from `intent.md`); PR-1 through PR-6 represent the baseline regardless of that decision.

---

## 7. AI Behavior Requirements

*(Applies to any AI/LLM component; V1 has none in the plan-generation path, but this section constrains any future addition per the intent's constraint that plan numbers stay deterministic.)*

- AI-1: No AI/LLM component may generate, alter, or directly output the numeric contents of a workout prescription (sets/reps/weight) or nutrition target (calories/macros) in V1. These values are produced exclusively by the deterministic rule/formula engine (FR-2, FR-3, FR-6).
- AI-2: If a future AI coaching/chat layer is added, it may explain, contextualize, or motivate around plan data, but any change it proposes to actual numbers must route through the same deterministic rules and require explicit user confirmation — it cannot silently overwrite a plan.
- AI-3: Any future AI-generated text must not make medical, diagnostic, or treatment claims, and must not contradict the Safety Requirements below.
- AI-4: Any future AI-generated content must be identifiable to the user as AI-generated where it is user-facing advice (transparency).
- AI-5: The post-session summary's explanatory text (FR-8.4) may be AI-written. The AI receives only the deterministic session facts (no name, email, age, or body measurements), must not introduce numbers absent from those facts (replies that do are discarded), and is labelled as AI-generated with a not-medical-advice note. Whenever the AI text is unavailable or rejected, rule-based text derived from the same facts is shown instead, so the summary never depends on the AI.

---

## 8. Safety Requirements

- SR-1: Generated calorie targets must never be set below an established safe minimum floor (a widely-accepted baseline, e.g., not below ~1200 kcal/day for women or ~1500 kcal/day for men, subject to confirmation — see Open Questions), regardless of how aggressive the user's stated goal is.
- SR-2: The system must not permit a nutrition or training goal configuration that is generally recognized as unsafe (e.g., extreme simultaneous aggressive deficit + high training volume) without at minimum surfacing a warning to the user.
- SR-3: Exercise selection for beginners must favor safer, lower-technical-complexity movements; higher-skill compound lifts (e.g., barbell snatch-type movements) should be gated behind fitness level or accompanied by clear form guidance.
- SR-4: Progressive overload suggestions (FR-6) must use conservative increments and must never suggest an increase after a missed/failed set — only after the full prescription was met.
- SR-5: The app must present a clear, visible disclaimer that it is a fitness/wellness tool, not a medical device, and that users with pre-existing health conditions or injuries should consult a qualified professional before starting a program. This disclaimer must be shown during onboarding, not buried in terms of service.
- SR-6: The app must never recommend an exercise requiring equipment the user has not declared as available (reiterating FR-2.2 as a safety-relevant, not just convenience, requirement — using unfamiliar/unavailable equipment improvised is a real injury risk).

---

## 9. Acceptance Criteria

**Profile & Plan Generation**
- AC-1: Given a completed profile, when the user finishes onboarding, then a workout plan and nutrition targets are generated and displayed without further input.
- AC-2: Given a user has no equipment beyond bodyweight, when their plan is generated, then no prescribed exercise requires equipment outside their declared list.
- AC-3: Given a user edits their goal, when they save the change, then they are prompted to regenerate affected plans, and declining leaves the existing plan/targets unchanged.

**3D Muscle Model**
- AC-4: Given the 3D model is loaded, when the user selects a muscle region, then only exercises tagged with that muscle group (as primary or secondary) are shown.
- AC-5: Given a user cannot interact with the 3D view, when they use the non-visual fallback, then they can still reach the same muscle-to-exercise browsing capability.

**Workout Logging**
- AC-6: Given a planned session, when the user logs all prescribed sets meeting the prescription, then on completion a progression suggestion is generated for that exercise's next occurrence.
- AC-7: Given a user fails to complete a prescribed set (fewer reps than prescribed), when the session is evaluated, then no weight increase is suggested for that exercise.
- AC-8: Given a freeform session with exercises not in the plan, when it is saved, then it appears correctly in workout history and contributes to PR calculations.

**Food Logging**
- AC-9: Given a barcode is scanned and found in the data source, when the user confirms portion size, then the entry is added with correct calorie/macro values and daily totals update.
- AC-10: Given a barcode is scanned and not found, when the lookup fails, then the user is offered manual search/entry instead of a dead end.

**Progress Tracking**
- AC-11: Given a user logs a new heaviest set for an exercise, when the session is saved, then the PR for that exercise updates and is visibly flagged as a new record.
- AC-12: Given a user has logged at least two weight entries, when they open the progress section, then a trend chart renders reflecting both entries in the correct unit system.

**Account & Privacy**
- AC-13: Given a signed-in user requests account deletion, when the request is confirmed, then their profile, logs, and weight entries are no longer accessible through the app.
- AC-14: Given a new user has not yet accepted the disclaimer (SR-5), when they attempt to complete onboarding, then they must acknowledge it before a plan is generated.

**Weekly Schedule**
- AC-16: Given a user has chosen their training weekdays, when they open the plan, then they see the current week day by day with each session on its weekday, rest days marked, and each session's status; a session completed on a different day of the same week shows as done.
- AC-17: Given a scheduled session's day has passed without it being done, when the user opens the plan, then it is shown as missed with a recommended option and its reason, plus the alternatives (always including skip); choosing an option updates the week, and the choice can be undone.
- AC-18: Given a user has chosen back-to-back training days and the recommended split, when their plan is generated, then no two consecutive days are both full body or share the same focus.
- AC-19: Given a user sets a day to "Pull + Legs + Core" and accepts the preview, when the new plan version is created, then that day's exercises target both pull and leg muscle groups and end with ab exercises, and the choice is kept for future regenerations.
- AC-21: Given a user has chosen their training weekdays, when they open the month view, then they see the month Monday first with each training day showing its focus and status and rest days blank, can move to the previous and next month, and tapping a day opens the week view at that week.
- AC-22: Given a user completed a session in a week more than 20 sessions ago, when they move back to that week in the plan, then that session shows as done; and given the current plan version took effect mid-week, days before then are not shown as missed.

**Session Summary**
- AC-15: Given a user completes any workout session, when the session is saved, then a summary of the work done, muscles worked, goal fit, and next session is shown before they leave; if AI text is shown it is labelled as AI-generated and contains only numbers present in the session facts, and if AI text is unavailable the rule-based summary is shown instead.

**Body Progress**
- AC-20: Given a planned day on which some of the prescribed sets have been logged, when the user opens body progress for that date, then:
  - each targeted muscle shows its done, planned and remaining weighted sets and its percent (capped at 100);
  - the overall percent equals the planned work done divided by the planned work;
  - muscles worked outside the plan are listed as extra;
  - the 3D model tints each muscle in proportion to its value;
  - the 3D model labels each targeted muscle on the side facing the user with its percent (a tick once done), and each extra muscle with its set count, matching the list;
  - the same data is available in the list.

---

## 10. Assumptions

- A-1: Biological sex is required as a profile input because standard BMR formulas (e.g., Mifflin-St Jeor) require it for accuracy; `intent.md` did not explicitly list it, so it is added here as a necessary field.
- A-2: "Fitness level" is a three-tier self-reported field (beginner/intermediate/advanced); no objective fitness assessment is performed in V1.
- A-3: A user has exactly one active goal at a time in V1 (no multi-goal or goal-sequencing support).
- A-4: The muscle-group taxonomy for the 3D model is a fixed, app-defined list (~15-20 groups) decided during design, not user-configurable.
- A-5: "Today's planned session" maps plan days onto the weekdays the user chooses (FR-2.5). A missed session does not push the remaining sessions automatically; the user chooses to do it on a free day, merge it into the next session, or skip it (FR-2.6, resolving OQ-5).
- A-6: PR calculation uses estimated one-rep-max or straightforward heaviest-weight-for-reps logic; exact formula choice is an open question.
- A-7: Custom user-created foods are private per-user in V1 (not shared into a global database).

## 11. Unresolved Concerns / Open Questions

Carried forward from `intent.md`:
- Primary target market/region and resulting default unit system.
- Data-privacy/compliance posture (e.g., GDPR) pending target market.
- Long-term notification strategy (deferred entirely for V1).
- Future monetization model.
- Whether/how an AI coaching/chat layer is introduced later (constrained by AI-1–AI-4 above, but not designed). **Partly resolved**: an explanation-only AI layer now exists for the post-session summary (FR-8.4, AI-5), via the `session-insights` edge function. A conversational/chat layer remains undecided.

New, surfaced while writing this spec:
- ~~OQ-1: Exact safe-minimum calorie floor values (SR-1) need confirmation against a credible nutritional-safety reference before implementation.~~ **Resolved in Phase 6**: 1200 kcal/day (`female`), 1500 kcal/day (`male`); `prefer_not_to_say` uses the higher (safer) floor, 1500 kcal/day, not an average. See `/docs/decisions/OQ-1-safe-calorie-floor.md` for full rationale and alternatives considered.
- ~~OQ-2: Exact muscle-group taxonomy (which ~15-20 regions) is not yet defined.~~ **Resolved in Phase 3**: fixed 17-entry list (abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower_back, middle_back, neck, quadriceps, shoulders, traps, triceps), derived from the licensed exercise dataset's own vocabulary. See `/docs/decisions/OQ-2-muscle-group-taxonomy.md`.
- ~~OQ-3: Exact progressive-overload rule (increment size, e.g., fixed +2.5kg vs. percentage-based) is not yet defined.~~ **Resolved in Phase 8**: double progression — fixed +2.5kg weight increment (resetting reps to the floor) on full success with a tracked weight; +1 rep on full success for bodyweight exercises or on partial success (floor met, ceiling not reached); hold on any missed set. See `/docs/decisions/OQ-3-progression-increment-rule.md` for full rationale and alternatives considered.
- ~~OQ-4: PR calculation method (raw heaviest set vs. estimated 1RM formula) is not yet decided.~~ **Resolved in Phase 10**: heaviest weight per `(exercise, rep count)` bucket is the primary PR metric; estimated 1RM (Epley) is stored as supplementary context only. See `/docs/decisions/OQ-4-pr-calculation-method.md`.
- ~~OQ-5: Rescheduling behavior when a user misses or skips a planned session day is not yet defined.~~ **Resolved after Phase 13** (previously deferred past V1): the user picks their training weekdays (FR-2.5), and a missed session gets ranked options the user chooses between (do it on a free day, merge, or skip; FR-2.6). See `/docs/decisions/OQ-5-session-rescheduling.md`.
- ~~OQ-6: Whether biological sex is a fixed binary field or supports a non-binary/"prefer not to say" option (and, if so, which BMR formula path applies) is not yet decided.~~ **Resolved in Phase 2**: three-value field (`male`/`female`/`prefer_not_to_say`), not binary and not free text; `prefer_not_to_say` uses the arithmetic mean of the male/female Mifflin-St Jeor constant terms in Phase 6. See `/docs/decisions/OQ-6-biological-sex.md` for full rationale and alternatives considered.
- OQ-7: Whether custom user-created foods should ever be promoted into a shared/global food database (data quality vs. privacy tradeoff) is undecided.
- ~~OQ-8: Extent of the "unsafe configuration" warning in SR-2 — what specific thresholds trigger it, and whether it blocks plan generation or only warns, is undecided.~~ **Resolved in Phase 6**: non-blocking (generation always proceeds; the SR-1 floor still clamps the number); warning triggers on `goal === 'fat_loss'` combined with `trainingDaysPerWeek >= 6`, or a pre-floor-clamp target more than 300 kcal below the applicable SR-1 floor. See `/docs/decisions/OQ-1-safe-calorie-floor.md` for full rationale.
- ~~OQ-9: Data export (not just deletion) — whether users can export their own data (a common privacy-rights expectation) is not yet addressed.~~ **Explicitly deferred past V1 in Phase 13** (missed at Phase 12 sign-off, closed retroactively): no export feature ships; format/scope should be derived from PR-7's eventual compliance resolution rather than guessed at now. See `/docs/decisions/OQ-9-data-export.md`.
