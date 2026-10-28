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
- FR-2.1: On profile completion, the system must generate a workout plan consisting of a training split (e.g., full-body, upper/lower, push/pull/legs) selected deterministically from goal, fitness level, and training days per week.
- FR-2.2: Each planned session must be filled with exercises drawn from the exercise library, filtered to only exercises compatible with the user's declared equipment.
- FR-2.3: Each prescribed exercise must specify target sets, reps, and (where applicable) starting weight/intensity guidance appropriate to the user's fitness level.
- FR-2.4: The plan must be re-generatable on demand by the user, and automatically proposed for regeneration when a plan-affecting profile field changes (FR-1.4).

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
1. User opens the progress section.
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

---

## 10. Assumptions

- A-1: Biological sex is required as a profile input because standard BMR formulas (e.g., Mifflin-St Jeor) require it for accuracy; `intent.md` did not explicitly list it, so it is added here as a necessary field.
- A-2: "Fitness level" is a three-tier self-reported field (beginner/intermediate/advanced); no objective fitness assessment is performed in V1.
- A-3: A user has exactly one active goal at a time in V1 (no multi-goal or goal-sequencing support).
- A-4: The muscle-group taxonomy for the 3D model is a fixed, app-defined list (~15-20 groups) decided during design, not user-configurable.
- A-5: "Today's planned session" assumes a fixed weekly schedule mapped to calendar days once generated; rescheduling/skipping a day's session pushes remaining sessions rather than leaving gaps (exact rescheduling behavior is an open question below).
- A-6: PR calculation uses estimated one-rep-max or straightforward heaviest-weight-for-reps logic; exact formula choice is an open question.
- A-7: Custom user-created foods are private per-user in V1 (not shared into a global database).

## 11. Unresolved Concerns / Open Questions

Carried forward from `intent.md`:
- Primary target market/region and resulting default unit system.
- Data-privacy/compliance posture (e.g., GDPR) pending target market.
- Long-term notification strategy (deferred entirely for V1).
- Future monetization model.
- Whether/how an AI coaching/chat layer is introduced later (constrained by AI-1–AI-4 above, but not designed).

New, surfaced while writing this spec:
- OQ-1: Exact safe-minimum calorie floor values (SR-1) need confirmation against a credible nutritional-safety reference before implementation.
- OQ-2: Exact muscle-group taxonomy (which ~15-20 regions) is not yet defined.
- OQ-3: Exact progressive-overload rule (increment size, e.g., fixed +2.5kg vs. percentage-based) is not yet defined.
- OQ-4: PR calculation method (raw heaviest set vs. estimated 1RM formula) is not yet decided.
- OQ-5: Rescheduling behavior when a user misses or skips a planned session day is not yet defined.
- ~~OQ-6: Whether biological sex is a fixed binary field or supports a non-binary/"prefer not to say" option (and, if so, which BMR formula path applies) is not yet decided.~~ **Resolved in Phase 2**: three-value field (`male`/`female`/`prefer_not_to_say`), not binary and not free text; `prefer_not_to_say` uses the arithmetic mean of the male/female Mifflin-St Jeor constant terms in Phase 6. See `/docs/decisions/OQ-6-biological-sex.md` for full rationale and alternatives considered.
- OQ-7: Whether custom user-created foods should ever be promoted into a shared/global food database (data quality vs. privacy tradeoff) is undecided.
- OQ-8: Extent of the "unsafe configuration" warning in SR-2 — what specific thresholds trigger it, and whether it blocks plan generation or only warns, is undecided.
- OQ-9: Data export (not just deletion) — whether users can export their own data (a common privacy-rights expectation) is not yet addressed.
