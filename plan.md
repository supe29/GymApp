# Implementation Plan: AI Fitness Coach

Derived from `intent.md` (product intent) and `spec.md` (requirements/design spec). This document sequences the V1 build into phases. It does not contain application code.

**Assumed technical direction** (decided during design discussion, stated here because file/folder structure depends on it — not re-litigated as a discussion in this document; see **Architecture Decisions** below for the recorded rationale and alternatives for each):
- Single codebase for web + mobile using React Native + Expo, with web support via React Native Web.
- Supabase (Postgres + Auth + Storage) as the backend.
- Three.js via `@react-three/fiber` (web) / `expo-gl` bindings (native) for the 3D muscle model, in a shared package.
- Deterministic rule engines (plan generation, nutrition calculation, progressive overload) implemented as plain, platform-agnostic TypeScript in a shared package, independent of UI, so they are directly unit-testable.

**Repository shape referenced throughout this plan:**
```
/apps/app/                  - Expo app (iOS, Android, Web)
/packages/core/             - Deterministic business logic (planning, nutrition, progression, PRs, units)
/packages/api-client/       - Supabase client + typed data access
/packages/three-model/      - Shared 3D muscle model component (web + native implementations behind one contract)
/packages/ui/                - Shared UI components
/supabase/                  - Migrations, RLS policies, edge functions, seed data
/data/                       - Source datasets + import/tagging scripts for exercises/food
/docs/                       - Checklists, licensing records, and supporting docs
/e2e/                        - Cross-platform end-to-end tests
```

---

## Architecture Decisions

Pre-decided technical choices are recorded here as lightweight ADRs so the trade-offs are recoverable later, rather than living only in an earlier, undocumented design discussion. Recording these did not change any decision — none conflicts with `spec.md` — but each now has an explicit fallback if it stops working out.

### ADR-1: Expo / React Native + React Native Web for a single cross-platform codebase
- **Decision**: One Expo/React Native codebase targets iOS, Android, and Web via React Native Web.
- **Alternatives considered**: (a) fully native iOS + Android + a separate web app; (b) Flutter; (c) a web-only PWA with no native wrapper.
- **Reason**: `intent.md`'s Product constraint requires "a single coherent product across web and mobile, not two divergent experiences." A single codebase guarantees behavioral parity by construction rather than by cross-team discipline across separate codebases.
- **Trade-offs**: React Native Web has known gaps for performance-sensitive or platform-idiomatic UI (notably 3D rendering — see ADR-3); fully native would give better per-platform polish and native library access at the cost of 2–3x UI implementation effort and much higher parity risk.
- **Consequences**: All UI work happens once in `/apps/app/`; any RN Web limitation becomes a shared-codebase risk (see Phase 4 and Phase 9 parity work) rather than an isolated one.
- **Fallback**: If a specific screen proves infeasible in RN/RNW (most likely candidate: the 3D model), the fallback is a platform-specific implementation behind a shared interface, not abandoning the shared-codebase strategy wholesale.

### ADR-2: Supabase (Postgres + Auth + Storage) as the backend
- **Decision**: Supabase provides the database, authentication, storage, and edge functions.
- **Alternatives considered**: (a) Firebase; (b) a custom backend (e.g., Node/Postgres on a general cloud host); (c) another BaaS (AWS Amplify, AppWrite).
- **Reason**: Postgres gives relational integrity for the entity graph in `spec.md` §4.1 (profiles, plans, sessions, logs with real foreign keys); RLS gives per-user data isolation (DR-3, PR-1) without hand-rolled authorization code; built-in Auth covers FR-9.1 (email/password, Google, Apple) with less custom code than a self-built backend.
- **Trade-offs**: Less infrastructure control than a custom backend; RLS policy correctness becomes safety/privacy-critical and must be tested adversarially, not just trusted (see Phase 1); vendor lock-in to Supabase-specific features (RLS, edge functions) versus a portable custom backend.
- **Consequences**: Deterministic business logic (planning, nutrition, progression) is kept in a Supabase-agnostic `packages/core` package specifically to limit lock-in to the data layer, not the domain logic.
- **Fallback**: Because business logic is isolated in `packages/core`, migrating off Supabase later is a data-layer migration, not a full rewrite — but RLS policies and auth flows would need to be reimplemented from scratch on the new backend.

### ADR-3: Separate web and native 3D renderers behind a shared component
- **Decision**: `@react-three/fiber` renders the 3D muscle model on web; `expo-gl` bindings render it on native; both sit behind one shared `packages/three-model` component API and interaction contract.
- **Alternatives considered**: (a) a single WebView-hosted Three.js renderer used on both platforms; (b) a static, non-3D fallback (pre-rendered images per muscle group) as the only V1 implementation; (c) native-only 3D, with a static fallback on web.
- **Reason**: `expo-gl` gives native, GPU-accelerated rendering with better performance and input responsiveness than a WebView-hosted scene on mobile hardware; `@react-three/fiber` is the natural fit for the existing web/RNW stack (ADR-1).
- **Trade-offs**: Two renderer implementations behind one component is exactly the setup that produces "looks the same in the demo, breaks on device" parity bugs (hit-testing, camera behavior, visual fidelity). The WebView-everywhere alternative would remove that specific risk but at a real cost to native performance and input latency (NFR-2). This trade-off is why Phase 4 now specifies an explicit interaction contract and cross-renderer parity tests rather than relying on the shared component boundary alone.
- **Consequences**: Region hit-testing and camera/zoom math must be specified once, independent of renderer, and both renderer implementations must conform to it.
- **Fallback**: A static, image-based muscle map (tap-to-select regions on a 2D image instead of live 3D) is the documented contingency if either renderer cannot meet NFR-2 performance or the parity contract on a given platform — see R-7 in Cross-Cutting Risks. This was previously mentioned only informally; it is now a named, referenced contingency.

### ADR-4: External exercise dataset as the exercise library source
- **Decision**: Seed the exercise library from an existing open exercise dataset, re-tagged to the app's own muscle/equipment taxonomy (DR-1).
- **Alternatives considered**: (a) commission original exercise content (photography/video, written instructions) in-house; (b) license a commercial exercise-content API/dataset.
- **Reason**: Building an exercise library from scratch is a content effort disproportionate to V1 scope discipline (`intent.md`: "V1 favors a simple, trustworthy core loop... over breadth"); an existing open dataset gets usable content fastest.
- **Trade-offs**: Open datasets vary in quality/completeness and require curation effort (R-2); licensing terms can still restrict commercial use, redistribution, or require attribution — previously unvalidated, now gated by Phase 0.5 before content work proceeds.
- **Consequences**: A tagging/curation pipeline (Phase 3) is required regardless of source quality.
- **Fallback**: If the primary dataset's license is unsuitable, the fallback is a smaller, hand-curated exercise set covering the most common equipment/movement patterns, shipped as a reduced-but-compliant V1 library rather than blocking release.

### ADR-5: External food/barcode dataset(s) for nutrition data
- **Decision**: Compose the food database from external generic-food and barcode-lookup sources (e.g., USDA/Open Food Facts-style), supplemented by private user-created custom foods (DR-2).
- **Alternatives considered**: (a) a single commercial nutrition-data API with an SLA; (b) building and maintaining a proprietary food database in-house.
- **Reason**: No single free/open source covers both generic foods and barcode-scannable packaged products well; combining sources maximizes coverage without building a database from nothing.
- **Trade-offs**: Multiple sources means multiple licensing regimes and reliability/rate-limit profiles to track (R-4); a commercial API would simplify this at an ongoing cost currently out of scope (`intent.md`: no payment infrastructure in V1).
- **Consequences**: Phase 9 must handle inconsistent data shapes/quality across sources and a graceful not-found fallback (FR-7.4).
- **Fallback**: The `foodSearch`/`barcodeLookup` abstraction in `packages/api-client` is intended to allow swapping the underlying source without a UI rewrite if a source becomes unavailable or its terms change — a design intent to confirm during Phase 9, not yet verified.

---

## Phase Dependency Overview

```
Phase 0 (Foundations)
   ├─▶ Phase 0.5 (Content & Asset Licensing Go/No-Go)
   └─▶ Phase 1 (Data Model & Backend)
          ├─▶ Phase 2 (Auth & Profile)
          │      ├─▶ Phase 5 (Workout Plan Gen) ─┐
          │      └─▶ Phase 6 (Nutrition Plan Gen)─┤
          └─▶ Phase 3 (Exercise/Muscle Content) ◀── Phase 0.5
                 ├─▶ Phase 4 (3D Model & Browser) ◀── Phase 0.5
                 └─▶ Phase 5 (Workout Plan Gen) ◀──┘
                        └─▶ Phase 7 (Workout Logging)
                               └─▶ Phase 8 (Progressive Overload)
Phase 6 ─────────────────────────▶ Phase 9 (Food DB & Logging) ◀── Phase 0.5
Phase 7 ─────────────────────────▶ Phase 10 (Progress Tracking)

Phases 2,4,5,6,7,9,10 ─▶ Phase 11 (Dashboard/Onboarding Assembly)
Phase 11 ─▶ Phase 12 (Privacy/Security/Safety Hardening)
Phase 12 ─▶ Phase 13 (Cross-Platform QA & Release Prep)
```

---

## Phase 0 — Project Foundations & Repository Setup

### Goal
Establish the monorepo, app scaffold, backend project, and CI pipeline that every later phase builds on.

### Files to create/modify
- `/package.json`, `/tsconfig.base.json`, `/.eslintrc.*`, `/.prettierrc`
- `/apps/app/` (Expo app scaffold: `app.json`, entry point, base navigation stub)
- `/packages/core/package.json`, `/packages/api-client/package.json`, `/packages/ui/package.json`, `/packages/three-model/package.json`
- `/supabase/config.toml`
- `/.github/workflows/ci.yml`
- `/.env.example`

### Implementation
Initialize workspace tooling (npm/yarn workspaces); scaffold the Expo app targeting iOS, Android, and Web; initialize the Supabase project (local CLI + remote project linkage); configure linting, formatting, and type-checking; configure CI to run lint/typecheck/test on every push.

### Tests
CI pipeline executes successfully against the empty scaffold; lint and typecheck pass with zero errors.

### Acceptance criteria
A trivial screen runs on web, iOS simulator, and Android emulator from the same codebase. CI is green on a clean push.

### Dependencies
None — first phase.

---

## Phase 0.5 — Content & Asset Licensing Go/No-Go

### Goal
Validate, before any content-dependent implementation work begins, that every external asset/dataset this plan relies on (3D mesh, exercise dataset, food/barcode data sources) can legally be used, stored, and shipped the way this plan assumes. This replaces the previously undocumented assumption that these assets are "available and license-compatible" with an explicit, signed-off checkpoint.

### Files to create/modify
- `/docs/licensing/3d-mesh-license.md`
- `/docs/licensing/exercise-dataset-license.md`
- `/docs/licensing/food-dataset-licenses.md`
- `/docs/licensing/go-no-go-checklist.md`

### Implementation
For the 3D mesh asset, the exercise dataset, and each food/barcode data source, explicitly verify and document:
- **Commercial/use license**: production use is permitted, not research/personal-use-only terms.
- **Redistribution rules**: whether raw or re-tagged/re-hosted data may be stored in this app's own database/asset bundle, or must be queried live from the source.
- **Attribution requirements**: and where in the app attribution must be displayed to remain compliant.
- **Offline/local storage permission**: whether data may be cached/stored in Supabase or the app bundle (assumed by DR-1's "does not depend on that dataset being queried live at runtime") or must remain a live lookup only.
- **API usage restrictions**: rate limits, required API keys, usage-based pricing thresholds relevant to Phase 9's barcode/food lookups (R-4).
- **Dataset maintenance strategy**: a named owner and cadence for re-importing/re-tagging updates to each dataset (NFR-6).

### Tests
None — this is a documentation/decision gate, not a code phase. The signed-off checklist is the artifact under review.

### Acceptance criteria
Each asset category (3D mesh, exercise dataset, food/barcode sources) has a signed-off entry in `/docs/licensing/go-no-go-checklist.md` covering all six items above. **No phase that consumes one of these assets (Phase 3, Phase 4, Phase 9) may begin implementation against a given asset until that asset's entry is signed off.** If an asset fails this gate, the corresponding fallback (ADR-4 for exercise content, ADR-5 for food data, ADR-3's static fallback for the 3D mesh) is adopted for that asset and re-validated before the dependent phase proceeds.

### Dependencies
Phase 0 (repo exists so findings can be committed as docs).

---

## Phase 1 — Data Model & Backend Infrastructure

### Goal
Define and provision the relational schema and access-control rules backing every entity in `spec.md` §4.1, including version-tracked plans/targets (DR-5) and adversarially-tested access control (PR-1, DR-3) from the outset rather than at final audit.

### Files to create/modify
- `/supabase/migrations/0001_profiles.sql`
- `/supabase/migrations/0002_equipment_and_muscle_taxonomy.sql`
- `/supabase/migrations/0003_exercises.sql`
- `/supabase/migrations/0004_workout_plans_and_sessions.sql`
- `/supabase/migrations/0005_set_logs_and_progression.sql`
- `/supabase/migrations/0006_nutrition_and_food.sql`
- `/supabase/migrations/0007_weight_entries_and_prs.sql`
- `/supabase/migrations/0008_rls_policies.sql`
- `/supabase/migrations/0009_plan_target_versioning.sql`
- `/supabase/migrations/0010_exercise_category_mechanic.sql` (added post-QA: exercise type + compound/isolation, consumed by Phase 5's exercise selection)
- `/packages/api-client/src/types/database.ts` (generated types)
- `/packages/api-client/src/client.ts`
- `/supabase/tests/rls_adversarial.sql` (or equivalent pgTAP/API-level test harness)

### Implementation
Create tables for: User Profile, Equipment Item, Muscle Group, Exercise, Workout Plan, Planned Session, Workout Session, Set Log, Progression Suggestion, Personal Record, Nutrition Target, Food Item, Food Log Entry, Weight Entry (per spec §4.1), with correct foreign-key relationships. Define Row Level Security policies so every table scoping to a user is only readable/writable by that user.

**DR-5 — plan/target versioning (owned here, at the schema level):** `Workout Plan` and `Nutrition Target` rows are immutable once created. Each carries a `plan_version` / `target_version` (monotonic per user), an `effective_from` timestamp, and a nullable `superseded_at` timestamp. Regenerating or editing a plan-affecting field never mutates an existing plan/target row — it inserts a new version and stamps `superseded_at` on the prior one. `Workout Session`, `Set Log`, and `Nutrition Target` consumption records (daily totals) store a foreign key to the specific `plan_version`/`target_version` that was active when the log was created, so historical logs remain attributable to the plan that produced them even after later regenerations. Generate typed client bindings for the app.

### Tests
Migration apply/rollback tests. **Adversarial RLS tests run at the API level (not just direct-DB policy checks)**, for every user-scoped table: (a) user A cannot **read** user B's rows; (b) user A cannot **update** user B's rows; (c) user A cannot **delete** user B's rows; (d) unauthenticated requests are rejected outright; (e) service-role-only operations (e.g., the account-deletion routine) are unreachable via the anon/authenticated API roles. DR-5 tests: regenerating a plan creates a new version without mutating or deleting the prior one; a Set Log created against version N still resolves to version N's prescription after a subsequent regeneration creates version N+1.

### Acceptance criteria
All entities from spec §4.1 exist with correct relationships. Cross-user read/update/delete attempts are rejected, through the real API, on every user-scoped table; unauthenticated access is rejected; service-role-only operations are inaccessible to normal users. Typed client compiles cleanly against the schema. A regenerated plan/target never silently reassigns or deletes historical logs' version attribution.

### Dependencies
Phase 0 (Supabase project + repo tooling).

---

## Phase 2 — Authentication & Profile Management

### Goal
Users can create accounts, sign in, complete onboarding with a full profile, and manage/delete their account. (Covers FR-1.x, FR-9.x, SR-5, AC-14.)

### Files to create/modify
- `/apps/app/features/auth/SignUpScreen.tsx`, `SignInScreen.tsx`, `ForgotPasswordScreen.tsx`
- `/apps/app/features/profile/ProfileSetupFlow.tsx`, `EquipmentChecklist.tsx`, `EditProfileScreen.tsx`
- `/apps/app/features/profile/OnboardingProgressIndicator.tsx` (step X of Y indicator, UX-1)
- `/apps/app/features/legal/DisclaimerScreen.tsx`
- `/packages/api-client/src/auth.ts`, `/packages/api-client/src/profile.ts`
- `/packages/core/src/validation/profileValidation.ts`
- `/supabase/functions/delete-account/index.ts` (deletion routine stub — completed fully in Phase 12)

### Implementation
Wire Supabase Auth for email/password, Google, and Apple sign-in, including forgot/reset-password (FR-9.2). Build the guided onboarding flow capturing age, height, weight, biological sex, fitness level, goal, training days/week, and the grouped/preset equipment checklist (FR-1.2), with a visible step-progress indicator (UX-1). Gate onboarding completion on disclaimer acknowledgment (SR-5, AC-14). Build profile editing with a "this affects your plan — regenerate?" prompt hook on plan-affecting field changes (FR-1.4) — the prompt is wired here; actual regeneration logic (and DR-5 versioning) lands in Phases 5/6. Implement account deletion request flow calling the deletion routine. All screens/routes require an authenticated session (FR-9.4 — no guest mode).

### Tests
Unit tests for profile field validation. Integration tests for sign-up/sign-in via all three methods (OAuth mocked). Test the forgot/reset-password flow end-to-end (FR-9.2). Test that no app route is reachable without authentication (FR-9.4). Test that onboarding cannot complete without disclaimer acknowledgment. Test that editing a plan-affecting field surfaces the regeneration prompt and that declining leaves data unchanged.

### Acceptance criteria
AC-14 passes. A user can complete onboarding via any of the three auth methods, edit their profile afterward, reset a forgotten password, and submit an account deletion request that the backend accepts. No functionality is reachable without signing in.

### Dependencies
Phase 1 (profiles table + RLS).

---

## Phase 3 — Content Library: Exercises, Muscle Taxonomy & Equipment

### Goal
Populate and expose the tagged exercise library that plan generation and the 3D model browser both depend on (DR-1, resolves OQ-2).

### Files to create/modify
- `/data/exercises/source/` (raw imported open dataset)
- `/data/exercises/mapping/muscleTaxonomy.json`
- `/data/exercises/mapping/equipmentTaxonomy.json`
- `/data/exercises/scripts/importAndTag.ts`
- `/supabase/seed/exercises_seed.sql` (generated output of the tagging script)
- `/packages/core/src/content/exerciseQueries.ts`

### Implementation
Finalize the fixed muscle-group taxonomy (~15-20 regions) and the equipment taxonomy (aligned with the Phase 2 equipment checklist), reusing the normalized region IDs shared with Phase 4's interaction contract. Import the open-license exercise dataset validated in Phase 0.5; write and run a tagging script that maps each exercise's muscles/equipment/difficulty onto the app's taxonomy; manually curate/correct entries for quality. Load the result into the `exercises` table, carrying over the source dataset's exercise `category` (strength/stretching/cardio/plyometrics/…) and `mechanic` (compound/isolation) — added post-QA via migration 0010, because Phase 5 needs them to keep non-resistance movements out of plans (see Phase 5). Build query helpers: by muscle group, by equipment subset, by difficulty (the difficulty field is required input for Phase 5's SR-3 gating logic).

### Tests
Data-quality tests: every exercise has ≥1 primary muscle, a difficulty rating, and only valid taxonomy references. Unit tests for query helpers (muscle-group filter, equipment-subset filter, difficulty filter).

### Acceptance criteria
The exercise library is queryable by muscle group, by equipment, and by difficulty. A manual spot-check of a sample of exercises confirms correct tagging. Taxonomies are finalized and documented in `/data/exercises/mapping/`.

### Dependencies
Phase 1 (exercises/muscle_groups/equipment tables), Phase 0.5 (exercise dataset licensing sign-off).

---

## Phase 4 — 3D Muscle Model & Exercise Browser

### Goal
Deliver the interactive 3D muscle model and muscle-to-exercise browsing, with **measurable behavioral parity between the web and native renderers** and an accessible fallback. (FR-4.x, NFR-1, NFR-2, NFR-5, UX-5, AC-4, AC-5.)

### Files to create/modify
- `/packages/three-model/src/interactionContract.ts` (renderer-independent interaction contract: region IDs, selection semantics, camera/zoom state shape)
- `/packages/three-model/src/muscleRegions.ts` (normalized region ID list, shared by both renderers and Phase 3's taxonomy)
- `/packages/three-model/src/web/BodyModel.web.tsx` (`@react-three/fiber` implementation)
- `/packages/three-model/src/native/BodyModel.native.tsx` (`expo-gl` implementation)
- `/packages/three-model/src/BodyModel.tsx` (shared entry point selecting the platform implementation)
- `/packages/three-model/src/__tests__/parity/` (cross-renderer parity test suite)
- `/apps/app/features/muscle-explorer/MuscleExplorerScreen.tsx`
- `/apps/app/features/muscle-explorer/MuscleListFallback.tsx`
- `/apps/app/features/exercise-library/ExerciseDetailScreen.tsx`

### Implementation
Integrate the sourced rigged low-poly human mesh asset (gated on Phase 0.5 sign-off). Before building either renderer, define a **shared 3D interaction contract** (`interactionContract.ts`) that is renderer-independent:
- **Normalized region IDs**: a single fixed list of muscle-region identifiers (aligned with Phase 3's muscle taxonomy) that both renderers must expose selection events against — never renderer-specific mesh/node names.
- **Selection semantics**: what counts as a "select" (tap/click on a region), how overlapping regions resolve (nearest-region-wins, with a defined tie-break rule), and the resulting selection state shape (`{ regionId, timestamp }`) — identical on both platforms.
- **Equivalent camera/rotation/zoom behavior**: a normalized camera model (rotation bounds, zoom min/max, damping/inertia) implemented independently per renderer but validated against the same numeric contract (e.g., a given zoom value maps to equivalent visual framing on both platforms; a given drag-rotate gesture maps to an equivalent rotation delta).
- **Renderer-independent selection logic where possible**: hit-testing input is computed against shared region-boundary data (`muscleRegions.ts`) rather than duplicated per renderer wherever the underlying geometry allows it; only the renderer-specific raycasting/picking call may differ.

**Post-QA calibration (2026-10-31):** `muscleRegions.ts` was recalibrated against the vendored mesh's actual skinned vertex positions (T-pose: arms along ±x), and `resolveRegionAtPoint` mirrors hits on the −x side so both limbs select the same region (bilateral symmetry, defined once in the contract so parity is unaffected). The mesh is normalized once in `shared/meshNormalization.ts` (using `SkeletonUtils.clone` so skinned meshes stay bound to the normalized skeleton); selection and the per-exercise pulse are painted onto the body surface via per-vertex colors rather than drawn as boxes. `packages/three-model/scripts/checkRegionCoverage.ts` re-verifies coverage after any mesh or region change. **Display polish (2026-10-31):** the arms are lowered from the T-pose for display (`applyRelaxedPose`) after each vertex's region and T-pose position are recorded; taps raycast the body surface and pass the tapped vertex's T-pose position to the contract, so regions stay calibrated in one frame and what lights up is exactly what was tapped (the invisible per-region hit boxes were removed). Neutral body color, primary/secondary muscles in distinct colors with an on-screen legend, a web-only hover tint, drags no longer select, and a contract-level `face` action backs Front/Back buttons. A true anatomical (individual-muscle) mesh would replace the asset itself and needs its own Phase 0.5 licensing review first. **Anatomical mesh (2026-11-01):** the owner chose Z-Anatomy (CC BY-SA 4.0, record in `/docs/licensing/anatomical-mesh-license.md`), and it replaced the Mixamo body. `packages/three-model/scripts/buildAnatomyMesh.py` builds `body-model.glb` from it with one mesh per region (`region-<key>`), plus non-selectable context muscles and bone. Selection now resolves from the tapped mesh's name (`regionIdFromMeshName` in the contract; the `select` action carries a region ID). This replaces the calibrated boxes, `resolveRegionAtPoint`, the arm-lowering pose and per-vertex painting: boundaries are the real muscle outlines, and both sides share one mesh, so bilateral symmetry needs no mirroring. Overlap cannot occur, so no tie-break rule is needed. The Muscle Explorer shows the required attribution line.

Build `BodyModel.web.tsx` and `BodyModel.native.tsx` against this contract, with `BodyModel.tsx` selecting the correct implementation per platform. Wire region selection to Phase 3's muscle taxonomy and exercise queries. Build the non-visual muscle-list fallback (NFR-5). Add "targeted muscles" display to the exercise detail view app-wide (FR-4.3).

### Tests
Unit tests for muscle-region → exercise-list query correctness. Interaction tests (select region → correct exercise list) run against **both** renderer implementations against the same fixture scenarios, not one platform standing in for both. **Cross-renderer parity suite**: an identical scripted sequence of selects/rotates/zooms is run through both `BodyModel.web.tsx` and `BodyModel.native.tsx`, asserting equivalent resulting state (`regionId` selected, camera framing within a defined numeric tolerance) at each step. Performance checks against the NFR-2 load/response targets on reference devices (a mid-range Android phone and a laptop). Accessibility test confirming the fallback list is reachable and functionally equivalent.

### Acceptance criteria
AC-4 and AC-5 pass. Model load/interaction time meets NFR-2 on both platforms. Exercise detail views consistently show correct muscle tags. **Measurable behavioral equivalence (NFR-1/FR-4.4)**: for the same scripted input sequence, both renderers (a) select the same `regionId` at each step, (b) resolve camera zoom/rotation state to within a defined numeric tolerance of each other (threshold to be fixed during implementation — see OQ-10), and (c) respond within the same perceptible-lag budget (NFR-2). A parity report comparing both renderers against these three measures is a required sign-off artifact for this phase, not just passing/failing unit tests.

### Dependencies
Phase 3 (tagged exercise/muscle data), Phase 0.5 (3D mesh licensing sign-off), Phase 0 (app scaffold).

---

## Phase 5 — Workout Plan Generation Engine

### Goal
Generate a personalized, equipment-aware, difficulty-appropriate workout plan deterministically from profile data, with version-tracked output. (FR-2.x, AC-1, AC-2, AC-3, SR-3, SR-6.)

### Files to create/modify
- `/packages/core/src/planning/splitSelector.ts`
- `/packages/core/src/planning/planGenerator.ts`
- `/packages/core/src/planning/rules/` (goal/level/day-count → split rule tables)
- `/packages/core/src/planning/rules/difficultyGating.ts` (SR-3: beginner-safe exercise selection and substitution rules)
- `/packages/core/src/planning/rules/exerciseSelection.ts` (added post-QA: which exercises are prescribable and in what preference order)
- `/packages/core/src/planning/versioning.ts` (DR-5: plan_version creation/supersession)
- `/apps/app/features/plan/WorkoutPlanScreen.tsx`
- `/apps/app/features/plan/RegeneratePlanPrompt.tsx`

### Implementation
Implement deterministic split-selection rules (goal + fitness level + training days/week → split template, e.g., full-body / upper-lower / push-pull-legs). Implement exercise-fill logic drawing from Phase 3's library, strictly filtered by the user's declared equipment (FR-2.2, SR-6 — no exercise requiring undeclared equipment may ever be selected).

**SR-3 — beginner exercise safety (owned here):** exercise selection consumes Phase 3's difficulty/technical-complexity tagging. For beginner fitness level, the fill logic must favor lower-technical-complexity movements and must not select high-skill compound lifts (e.g., barbell snatch-type movements) unless no safer alternative exists for the targeted muscle/equipment combination. Where a higher-skill movement is the only option compatible with the user's equipment, the plan must substitute a lower-complexity alternative targeting the same muscle group (`difficultyGating.ts` owns this substitution logic) rather than silently prescribing the advanced movement; intermediate/advanced users are not subject to this gate.

**Exercise selection quality (added post-QA, FR-2.1/FR-2.3):** live testing found plans prescribing foam rolling, skipping and olympic lifts at 4×12-15, identical A/B days, and effectively random exercise choice (ranked by id). Selection therefore (a) only prescribes `strength`/`powerlifting` category exercises (`exerciseSelection.ts`; exercises seeded before migration 0010 have no category and stay eligible); (b) ranks primary-muscle matches, then a curated per-muscle list of staple lifts, then compound before isolation, then name — still fully deterministic; (c) rotates repeated day templates (Upper A/B) to different exercises when the library allows; (d) gives isolation exercises their own prescription (at most 3 sets, at least 8-12 reps); and (e) cycles the day's muscle groups until the session reaches its target size when some group has no compatible exercise (e.g. bodyweight-only users), so sessions are only thinner when the library is genuinely exhausted.

Implement default prescriptions (sets/reps/starting intensity) scaled by fitness level (FR-2.3). Implement on-demand regeneration and completion of the Phase 2 regeneration-prompt hook, with a plan-diff summary shown on acceptance (FR-2.4). **DR-5 — versioning (owned here, at the generation layer):** every generation or regeneration produces a new `plan_version` via Phase 1's versioning columns rather than mutating the existing plan row; declining a regeneration prompt leaves the current version untouched and does not create a new one.

### Tests
Unit tests covering every goal × fitness-level × training-day-count combination produces a valid, non-empty plan. Property-based test asserting no generated exercise ever requires undeclared equipment (AC-2). **SR-3 tests**: for beginner fitness level, assert no high-skill/high-complexity exercise is ever selected when a lower-complexity substitute exists for the same muscle/equipment combination; regression fixtures confirming intermediate/advanced plans are not over-restricted by this gate. Regression fixtures for split selection. Integration test for the full onboarding → plan flow (AC-1). Regeneration test confirming decline leaves the prior plan version untouched, and a new regeneration creates a new version without deleting the old one (AC-3, DR-5).

### Acceptance criteria
AC-1, AC-2, and AC-3 pass. Plan generation is deterministic (identical inputs always produce the identical plan) and every generated value is traceable to its input per NFR-7. No beginner-level plan ever includes a high-skill compound movement without an available safer substitute (SR-3). Every generation/regeneration produces a distinct, immutable `plan_version`, and historical Set Logs continue to resolve to the version active when they were created.

### Dependencies
Phase 2 (profile data + regeneration hook), Phase 3 (exercise library with difficulty tagging).

---

## Phase 6 — Nutrition Plan Generation Engine

### Goal
Generate daily calorie/macro targets deterministically, with enforced safety floors and version-tracked output. (FR-3.x, SR-1, SR-2, resolves OQ-1.)

### Files to create/modify
- `/packages/core/src/nutrition/bmrCalculator.ts`
- `/packages/core/src/nutrition/macroCalculator.ts`
- `/packages/core/src/nutrition/safetyLimits.ts`
- `/packages/core/src/nutrition/versioning.ts` (DR-5: target_version creation/supersession)
- `/packages/core/src/units/` (shared unit-conversion utilities, UX-8 — reused by Phase 9 and Phase 10)
- `/apps/app/features/plan/NutritionTargetsScreen.tsx`

### Implementation
Implement BMR calculation (Mifflin-St Jeor) plus activity multiplier and goal-based adjustment to produce a calorie target; implement macro-split rules per goal. Implement and enforce a safe-minimum calorie floor (SR-1) using the nutritional-safety reference confirmed via OQ-1, and an unsafe-configuration warning (SR-2) for extreme goal/profile combinations. Wire into onboarding and into the Phase 2 regeneration hook alongside Phase 5. **DR-5 — versioning (owned here, mirroring Phase 5):** every generation or regeneration produces a new `target_version` rather than mutating the existing row; Food Log Entries record which `target_version` was active at logging time so historical daily totals remain attributable to the targets that were in force when they were logged. Route all calorie/weight unit display through the shared `packages/core/src/units/` utility rather than per-screen conversion logic (UX-8).

### Tests
Unit tests validating BMR/TDEE output against known reference calculations. Boundary/adversarial tests confirming the safety floor cannot be breached regardless of extreme profile inputs. Tests confirming the SR-2 warning triggers on the defined extreme-configuration conditions. Versioning tests mirroring Phase 5's (regeneration creates a new version; decline leaves the current version untouched; historical Food Log Entries keep resolving to their original `target_version`).

### Acceptance criteria
Generated targets match reference calculations within tolerance. The safety floor holds under adversarial inputs. Targets are traceable to their inputs per NFR-7. Every generation/regeneration produces a distinct, immutable `target_version`, and historical Food Log Entries continue to resolve to the version active when they were logged.

### Dependencies
Phase 2 (profile data).

---

## Phase 7 — Workout Logging & Session Flow

### Goal
Users can log workout sessions, either plan-attached or freeform, resiliently across brief connectivity drops. (FR-5.x, UX-4, NFR-3, AC-8; lays groundwork for AC-6/AC-7 in Phase 8.)

### Files to create/modify
- `/apps/app/features/workout-session/SessionScreen.tsx`
- `/apps/app/features/workout-session/SetLogger.tsx`
- `/apps/app/features/workout-session/RestTimer.tsx`
- `/apps/app/features/workout-session/FreeformSessionScreen.tsx`
- `/apps/app/features/workout-session/offlineQueue.ts` (NFR-3: local queue/retry for set logs during brief connectivity drops)
- `/apps/app/features/history/WorkoutHistoryScreen.tsx`
- `/packages/api-client/src/workoutSessions.ts`
- `/packages/core/src/logs/logAggregation.ts` (shared read layer over Set Logs, reused by Phase 8 and Phase 10 to satisfy NFR-4)

### Implementation
Build the plan-attached session screen pre-filled from Phase 5's plan, supporting add/skip/substitute mid-session (FR-5.3); build the freeform session screen with no plan attachment; build set logging optimized for one-handed, glanceable gym use (UX-4: large tap targets, steppers over free text — post-QA, stepper values are also directly editable via `apps/app/components/NumberStepper.tsx`, since large jumps such as 70 → 100 kg took dozens of taps; each prescribed exercise shows its target sets × reps (FR-2.3) and pre-fills from the target or the user's most recent earlier set; completing a session with untouched exercises asks for confirmation first); build the rest timer (FR-5.4); persist completed sessions and surface them in workout history (FR-5.5). **NFR-3 — connectivity resilience (owned here):** each logged set is first written to a local queue (`offlineQueue.ts`) and optimistically reflected in the UI, then synced to the backend with retry-on-reconnect; a brief connectivity drop must never silently discard an already-entered set, and the UI must indicate any set still pending sync. **NFR-4 — shared calculation source (owned here):** all reads of Set Log history for progression evaluation (Phase 8) and PR derivation (Phase 10) go through the shared `logAggregation.ts` module rather than each feature independently querying/aggregating raw logs, so the two can never diverge on the same underlying data.

### Tests
Integration test logging a full plan-attached session including a mid-session substitution. Integration test creating and completing a freeform session, confirming correct history storage (AC-8). Rest timer unit tests. **Connectivity-resilience test**: simulate a connectivity drop mid-session after sets have been entered locally, confirm no entered set is lost, and confirm sync completes once connectivity returns. Unit tests for `logAggregation.ts` confirming Phase 8 and Phase 10 consume identical query results for the same input data.

### Acceptance criteria
AC-8 passes. Both a plan-attached and a freeform session can be logged end-to-end and appear correctly, with correct data, in history. A simulated brief connectivity drop during logging never results in lost sets (NFR-3). Progression evaluation and PR derivation are demonstrably reading from the same aggregation logic (NFR-4).

### Dependencies
Phase 1 (session/set-log tables), Phase 5 (plan data to attach to).

---

## Phase 8 — Progressive Overload Engine

### Goal
Evaluate completed sessions and generate explainable next-session suggestions. (FR-6.x, SR-4, AC-6, AC-7, resolves OQ-3.)

### Files to create/modify
- `/packages/core/src/progression/evaluateSession.ts`
- `/packages/core/src/progression/rules/incrementRules.ts`
- `/apps/app/features/plan/ProgressionSuggestionCard.tsx`

### Implementation
Implement the deterministic progression rule set (e.g., a fixed conservative weight/rep increment on full-prescription success; hold on any missed rep — resolving OQ-3, enforcing SR-4). Read session history exclusively through Phase 7's shared `logAggregation.ts` module (NFR-4), not a separate query path. Trigger evaluation on session completion (hooking into Phase 7). Feed accepted suggestions into the corresponding planned session for its next occurrence (Phase 5's data, respecting the active `plan_version`). Implement accept/decline/manual-override (FR-6.2) and plain-language rationale display (FR-6.3).

### Tests
Unit tests covering full-success, partial-success, and full-miss scenarios per exercise. Regression test asserting no weight/rep increase is ever suggested after a missed set (AC-7, SR-4). Integration test tracing session completion through to a visible suggestion before the exercise's next occurrence (AC-6).

### Acceptance criteria
AC-6 and AC-7 pass. Suggestions are always accompanied by a correct rationale and never violate SR-4 under any tested input.

### Dependencies
Phase 5 (plan structure to update), Phase 7 (session logs and shared aggregation module to evaluate).

---

## Phase 9 — Food Database Integration & Food Logging

### Goal
Users can search, scan, and log food against their nutrition targets, with an explicit and documented distinction between native and browser-based barcode scanning, and without leaking unnecessary personal data to external lookups. (FR-7.x, UX-7, UX-8, PR-5, AC-9, AC-10, DR-2.)

### Files to create/modify
- `/packages/api-client/src/foodSearch.ts`
- `/packages/api-client/src/barcodeLookup.ts`
- `/apps/app/features/nutrition/FoodSearchScreen.tsx`, `CustomFoodForm.tsx`, `DiaryScreen.tsx`
- `/apps/app/features/nutrition/BarcodeScanScreen.native.tsx` (native camera-based scanning)
- `/apps/app/features/nutrition/BarcodeScanScreen.web.tsx` (browser camera-based scanning, with degraded-capability messaging)
- `/apps/app/features/nutrition/ManualBarcodeEntry.tsx` (fallback path when camera scanning is unavailable/unreliable)
- `/docs/privacy/external-lookup-data-flow.md` (PR-5: documented data flow for barcode/food lookups)
- `/data/food/scripts/importUsdaFoods.ts`, `/data/food/source/usda_sr_legacy_macros.json`, `/supabase/seed/food_items_seed.sql` (added post-QA: generic foods imported from USDA FoodData Central SR Legacy, licensing recorded in `/docs/licensing/food-dataset-licenses.md`)
- `/supabase/seed/food_items_barcode_demo_seed.sql` (fictional barcode demo rows; no real barcode source yet)

### Implementation
Integrate external food data sources for generic foods and barcode-scannable packaged products per DR-2 (gated on Phase 0.5 sign-off), plus user-created custom foods (private per user, A-7). **Post-QA status (2026-10-31):** generic foods are a real import of USDA FoodData Central SR Legacy (7,448 foods, CC0, per 100 g; licensing review recorded, owner sign-off pending in the go/no-go checklist). Packaged-product/barcode data still has no real source — that remains gated on its own licensing review and OQ-12. Search matches every query word in any order and ranks plain/basic forms first, and gram-based portions are logged as an amount in grams. Build search UI, custom food creation, and meal-slot-based diary logging. Compute and display running daily totals against Phase 6's targets (FR-7.3), respecting the user's unit preference via the shared `packages/core/src/units/` utility (UX-8).

**Barcode scanning parity (owned here):** native scanning (`BarcodeScanScreen.native.tsx`) uses the device camera directly via a native barcode-detection library. Browser scanning (`BarcodeScanScreen.web.tsx`) uses the browser's camera/barcode APIs, which are documented as materially less reliable (inconsistent browser support, lower detection accuracy, permission-prompt friction, no guaranteed hardware-accelerated decoding). Where browser scanning is unavailable (no camera permission, unsupported browser) or fails repeatedly, the UI must offer `ManualBarcodeEntry.tsx` (type in the barcode digits) or fall back to manual search — the user is never left at a dead end on web (extends FR-7.4's not-found fallback to also cover scan-unavailable, not just scan-succeeded-but-not-found).

**PR-5 — external lookup privacy (owned here):** `/docs/privacy/external-lookup-data-flow.md` documents, for each external lookup call: exactly what data leaves the app (e.g., barcode digits, free-text search query), which third-party API receives it, what is deliberately excluded (user identity, account ID, profile data, precise location — none of these are ever included in a lookup request payload), and any logging constraints (lookup requests/responses must not be logged with any user-identifying correlation beyond what's needed for debugging, and such logs must be short-retention).

### Tests
Integration test for search → log flow. Barcode found path and not-found fallback path (AC-9, AC-10). **Browser-scan-unavailable test**: simulate denied camera permission or unsupported browser and confirm the user is routed to manual entry/search, not a dead end. Custom food creation and reuse test. Daily-total calculation correctness across multiple entries and meal slots, in both supported unit systems. **PR-5 verification**: an outbound-request test/inspection asserting lookup request payloads contain only the search query or barcode value and no user-identifying fields.

### Acceptance criteria
AC-9 and AC-10 pass. A full day of mixed-source food logging (search + barcode + custom) produces correct running totals against targets, displayed in the correct unit system. On web, a user whose browser cannot reliably scan is never blocked from logging a food item. External lookup payloads are verified to exclude user-identifying data per the documented data-flow.

### Dependencies
Phase 1 (food tables), Phase 6 (targets to log against), Phase 0.5 (food/barcode dataset licensing sign-off).

---

## Phase 10 — Progress Tracking (Weight & Personal Records)

### Goal
Users can log weight over time and view automatically-derived personal records, computed from the same log data used elsewhere in the app. (FR-8.x, NFR-4, AC-11, AC-12, resolves OQ-4.)

### Files to create/modify
- `/packages/core/src/progress/prCalculator.ts`
- `/apps/app/features/progress/WeightTrendScreen.tsx`, `PersonalRecordsScreen.tsx`, `LogWeightModal.tsx`

### Implementation
Implement weight-entry logging and trend chart rendering (FR-8.1), rendering values through the shared `packages/core/src/units/` utility (UX-8). Implement PR derivation from set logs (resolving OQ-4, e.g., heaviest-weight-per-rep-bucket logic), reading exclusively through Phase 7's shared `logAggregation.ts` module (NFR-4) rather than a separate query path, triggered on session completion (FR-8.2). Build a dedicated progress section reachable from primary navigation (FR-8.3).

### Tests
Unit tests for PR derivation across varied histories, including ties and near-misses across multiple exercises. Integration test confirming a new heaviest set flags a new PR immediately (AC-11). Chart rendering test with at least two weight entries in both supported unit systems (AC-12). Cross-check test confirming `prCalculator.ts` and Phase 8's `evaluateSession.ts` produce consistent results when run against the same fixture log data (NFR-4).

### Acceptance criteria
AC-11 and AC-12 pass. PR history matches a hand-computed reference dataset exactly. PR derivation is demonstrably reading from the same shared aggregation layer as progression evaluation.

### Dependencies
Phase 7 (set logs and shared aggregation module to derive PRs from).

---

## Phase 11 — Dashboard, Onboarding Assembly & Cross-Platform UX Polish

### Goal
Assemble all individual features into the cohesive first-run and daily-use experience, and verify web/mobile parity. (UX-1, UX-3, UX-6, UX-9, NFR-1.)

### Files to create/modify
- `/apps/app/features/dashboard/DashboardScreen.tsx`
- `/apps/app/navigation/AppNavigator.tsx`
- `/apps/app/features/onboarding/OnboardingFlow.tsx`
- `/apps/app/components/EmptyState.tsx`

### Implementation
Wire the complete onboarding sequence end-to-end per spec user flow 2.1 (profile → plan → targets → disclaimer), including the Phase 2 step-progress indicator. Build the home dashboard surfacing today's planned session, nutrition progress, and quick-log actions (UX-3). Surface progression suggestions and new PRs proactively at relevant moments rather than only on stats screens (UX-6). Add empty states across all screens for zero-data scenarios (UX-9). Run a full web/mobile parity pass across every screen built in Phases 2–10 (NFR-1), explicitly including the Phase 4 3D-model parity report and the Phase 9 barcode-scanning platform distinction as parity-pass checklist items, not just a generic screen-by-screen comparison.

### Tests
End-to-end test of the full onboarding flow (spec §2.1) on both web and mobile. Navigation tests. A web/mobile parity checklist covering every screen, including the Phase 4 parity report and Phase 9's documented scan-fallback behavior. Empty-state rendering tests.

### Acceptance criteria
A brand-new user can go from sign-up to a populated dashboard with equivalent functionality on both a web browser and a mobile device.

### Dependencies
Phases 2, 4, 5, 6, 7, 9, 10 (all core features being assembled).

---

## Phase 12 — Privacy, Security & Safety Hardening

### Goal
Verify and close out every privacy, security, and safety requirement before release, re-auditing rather than first-discovering, since Phase 1 already established adversarial RLS coverage and Phase 5 already established SR-3 coverage. (PR-1–PR-7, SR-1–SR-6, AC-13, AC-14.)

### Files to create/modify
- `/supabase/functions/delete-account/index.ts` (completed — full cascading deletion)
- `/apps/app/features/legal/PrivacyPolicyScreen.tsx`
- `/docs/security-checklist.md`

### Implementation
Complete the account/data deletion routine to fully remove or irreversibly anonymize all personal data per DR-4 (PR-4, AC-13), including all `plan_version`/`target_version` history (DR-5). **Re-audit** (not first-audit) the RLS policies and adversarial tests already established in Phase 1 (PR-1), running them again against the fully integrated app to catch any regression introduced by later phases. Confirm TLS/HTTPS enforced end-to-end (PR-6). Add and surface privacy policy content during account creation (PR-3), including the PR-5 data-flow disclosure from Phase 9. Re-verify the onboarding disclaimer gate at the integration level (SR-5, AC-14). Re-run SR-1, SR-2, SR-3, SR-4, and SR-6 checks against the fully integrated app with adversarial inputs submitted through the real UI/API, confirming Phase 5's SR-3 gating and Phase 6's SR-1/SR-2 floors still hold end-to-end, not just in the isolated unit tests where they were first implemented.

### Tests
Cross-user data-access attempts against every table, run through the real API (re-running and extending Phase 1's adversarial suite, not writing it for the first time). Deletion-completeness test confirming zero residual rows/files — including superseded plan/target versions — after account deletion (AC-13). Adversarial integration tests re-confirming every Safety Requirement (including SR-3) holds end-to-end.

### Acceptance criteria
AC-13 and AC-14 pass at the full integration level. No cross-user data leakage is found. All Safety Requirements, including SR-3, hold under adversarial inputs through the real app, not only in unit isolation.

### Dependencies
All prior phases — this is a cross-cutting audit of the completed system.

---

## Phase 13 — Cross-Platform QA, Accessibility & Release Prep

### Goal
Final quality pass and readiness sign-off for a V1 release.

### Files to create/modify
- `/e2e/` (end-to-end test suite covering all user flows)
- `/docs/release-checklist.md`
- `/apps/app/app.json` (store metadata)

### Implementation
Run a full end-to-end regression pass across web, iOS, and Android covering every user flow in spec §2. Run an accessibility audit against NFR-5 (screen reader pass, contrast, fallback interactions). Run performance spot checks against NFR-2. Prepare app store listing assets for mobile. Do a final pass over every Open Question in `spec.md` and this plan, confirming each is either resolved or explicitly deferred with sign-off (not silently left open).

### Tests
Full end-to-end suite across all seven user flows on all three platforms. Manual accessibility/screen-reader pass. Load/performance spot checks on reference devices.

### Acceptance criteria
All acceptance criteria (AC-1 through AC-22) pass on web, iOS, and Android. No open question remains unresolved without an explicit, recorded deferral decision. The app is ready to submit/deploy. Every item in `/docs/deferred-production-checks.md` (real OAuth/device/Supabase integration checks accumulated from Phases 2 onward, deliberately deferred past each development phase but mandatory before production) is checked off, not silently left unverified.

### Dependencies
Phase 11 and Phase 12 complete.

---

## Cross-Cutting Risks

- **R-1 (3D asset dependency)**: The muscle-model mesh is a licensed or commissioned external asset; delivery delay or licensing issues directly block Phase 4 and everything downstream of it (plan browsing, exercise detail views). Mitigated by Phase 0.5's go/no-go gate, which surfaces licensing problems before Phase 4 implementation starts rather than mid-build.
- **R-2 (Content data quality)**: Both the exercise dataset (Phase 3) and food datasets (Phase 9) come from external sources of variable quality; under-curated tagging would silently produce wrong muscle mappings or wrong plan/nutrition output, which is hard to catch without deliberate spot-checking (already built into Phases 3 and 9's acceptance criteria).
- **R-3 (3D performance on low-end devices)**: Real-time 3D rendering on older/low-end Android hardware is a known risk area for NFR-2. Contingency: the static image-based muscle map fallback recorded in ADR-3, triggered if Phase 4's parity/performance report shows either renderer cannot meet NFR-2.
- **R-4 (External API cost/availability)**: Food-data and barcode-lookup sources (Phase 9) may have rate limits or future pricing changes outside this plan's control; not a blocker for V1 build but a monitoring item post-launch.
- **R-5 (App store review)**: Apple Sign-In requirement (tied to offering Google Sign-In on iOS) and general App Store/Play Store review timelines affect Phase 13's release timeline, not engineering effort.
- **R-6 (Safety-rule correctness)**: SR-1/SR-2/SR-3/SR-4/SR-6 are safety-critical and rule-based; an error in the rule implementation (not just a missing feature) could produce unsafe output — Phase 12's adversarial integration testing exists specifically to catch this class of bug before release, building on the unit-level coverage established when each rule was first implemented (Phase 5 for SR-3/SR-6, Phase 6 for SR-1/SR-2, Phase 8 for SR-4).
- **R-7 (3D cross-platform behavioral parity)**: `@react-three/fiber` (web) and `expo-gl` (native) are two independent rendering pipelines behind one shared component (ADR-3). Without the explicit interaction contract and parity test suite added to Phase 4, hit-testing, camera behavior, and selection precision could silently drift between platforms — passing isolated tests on each platform while failing NFR-1/FR-4.4's equivalence requirement in practice. Phase 4's parity report is the control for this risk; if it fails, ADR-3's static-fallback contingency applies.
- **R-8 (Browser barcode-scanning reliability)**: Browser camera/barcode APIs are materially less consistent across browsers/devices than native camera APIs, risking a degraded or broken food-logging path on web specifically (violating NFR-1's equivalent-behavior requirement and UX-7's low-friction goal). Mitigated by Phase 9's explicit native/browser split, documented limitations, and mandatory manual-entry fallback so web users are never blocked, even though their scanning experience may be less reliable than native's.

## Assumptions Carried Into This Plan

- Single Expo/React Native codebase (with React Native Web) is used for both platforms, per ADR-1 — not re-decided here.
- Supabase is the backend/database platform (ADR-2); deterministic business logic still lives in a framework-agnostic package so it isn't tightly coupled to Supabase.
- The specific external exercise dataset and food data sources (ADR-4, ADR-5) are assumed suitable in scope and content coverage; their **licensing** suitability is no longer an unvalidated assumption — it is explicitly checked at the Phase 0.5 go/no-go gate before Phase 3/4/9 implementation proceeds against them.
- One developer or a small team is assumed; phase sequencing is dependency-driven, not resourced/timeboxed — this plan does not estimate calendar duration per phase.

## Unresolved Questions Blocking Specific Phases

Carried from `spec.md`, mapped to where they must be resolved before that phase can be considered complete:

| Question | Must resolve by |
|---|---|
| ~~OQ-1: Exact safe-minimum calorie floor values~~ — **Resolved in Phase 6**, see `/docs/decisions/OQ-1-safe-calorie-floor.md` | Phase 6 |
| ~~OQ-2: Exact muscle-group taxonomy~~ — **Resolved in Phase 3**, see `/docs/decisions/OQ-2-muscle-group-taxonomy.md` | Phase 3 |
| ~~OQ-3: Exact progressive-overload increment rule~~ — **Resolved in Phase 8**, see `/docs/decisions/OQ-3-progression-increment-rule.md` | Phase 8 |
| ~~OQ-4: PR calculation method~~ — **Resolved in Phase 10**, see `/docs/decisions/OQ-4-pr-calculation-method.md` | Phase 10 |
| ~~OQ-5: Rescheduling behavior for missed/skipped sessions~~ — Deferred in Phase 13, then **resolved**: user-chosen weekdays plus suggest-and-choose missed-day options (FR-2.5/FR-2.6), see `/docs/decisions/OQ-5-session-rescheduling.md` | Phase 5 (or explicitly deferred past V1) |
| ~~OQ-6: Biological sex field options and formula branching~~ — **Resolved in Phase 2**, see `/docs/decisions/OQ-6-biological-sex.md` | Phase 2 |
| OQ-7: Whether custom foods ever get promoted to a shared database | Not required for V1; deferred |
| ~~OQ-8: Exact SR-2 unsafe-configuration thresholds and block-vs-warn behavior~~ — **Resolved in Phase 6**, see `/docs/decisions/OQ-1-safe-calorie-floor.md` | Phase 6 |
| ~~OQ-9: Data export capability (beyond deletion)~~ — **Explicitly deferred past V1 in Phase 13** (missed at Phase 12 sign-off, closed retroactively), see `/docs/decisions/OQ-9-data-export.md` | Not currently scoped in any phase — flagged for product decision before Phase 12 sign-off |
| ~~OQ-10: Exact numeric tolerance for 3D-renderer parity (camera/zoom/rotation equivalence thresholds)~~ — **Resolved in Phase 4**, see `/docs/decisions/OQ-10-3d-parity-tolerance.md` | Phase 4 |
| ~~OQ-11: Exact local-queue/retry policy for connectivity drops during workout logging (how long to retry, how to surface a permanently-failed sync to the user)~~ — **Resolved in Phase 7**, see `/docs/decisions/OQ-11-connectivity-retry-policy.md` | Phase 7 |
| ~~OQ-12: Precise allow-list of fields permitted in external barcode/food lookup payloads, and the retention period for any lookup logging~~ — **Explicitly deferred in Phase 13** until a real external source is integrated, see `/docs/decisions/OQ-12-external-lookup-allowlist.md` | Phase 9 |
| ~~OQ-13: Go/no-go outcome for each external asset's licensing review (3D mesh, exercise dataset, each food/barcode source)~~ — **Resolved**: exercise dataset and 3D mesh signed off (GO), food/barcode dataset explicitly deferred with user sign-off (2026-10-28) to implement against placeholder data; since 2026-10-31 generic foods use USDA FoodData Central (licensing review recorded, owner sign-off pending) while barcode data remains unreviewed — see `/docs/licensing/go-no-go-checklist.md` | Phase 0.5 — blocks start of Phase 3, Phase 4, and Phase 9 respectively |
| ~~OQ-14: When a profile edit's regeneration prompt is declined, whether the user can later manually revert to a superseded `plan_version`/`target_version`, or only ever move forward to a new version~~ — **Resolved in Phase 13**: forward-only, no revert, see `/docs/decisions/OQ-14-plan-version-revert.md` | Phase 5 / Phase 6 |

None of these block starting Phase 0–1 (infrastructure work), but each must be explicitly resolved (or knowingly deferred with sign-off) before the phase listed above can be marked complete.

---

## Requirements Traceability

Every requirement ID from `spec.md` is mapped to at least one owning phase below. "Notes" flags anything that is a negative/scope constraint (satisfied by omission rather than a built feature), or that relies on a cross-cutting shared component introduced in this revision.

### Functional Requirements (FR)

| ID | Owning phase(s) | Notes |
|---|---|---|
| FR-1.1–1.4 | Phase 2 (generation hook completed in Phase 5/6) | |
| FR-2.1–2.4 | Phase 5 | |
| FR-2.5, FR-2.6 (weekly schedule, missed days) | Phase 5 (schedule logic in `packages/core/src/planning/weekSchedule.ts`), Phase 11 (Plan screen and dashboard) | Added after Phase 13; resolves OQ-5. |
| FR-2.7 (day focus, split override, core finisher) | Phase 5 (`packages/core/src/planning/dayPlanner.ts`, `planGenerator.ts` day plans), Phase 11 (Plan screen `DayFocusEditor`) | Added after Phase 13; changes apply through FR-2.4 regeneration. |
| FR-2.8 (week and month views, past and future) | Phase 5 (`packages/core/src/planning/monthSchedule.ts`), Phase 11 (Plan screen week navigation and `MonthCalendar`; range queries in `packages/api-client` `getCompletedSessionsInRange`, `getScheduleAdjustmentsInRange`) | Added after Phase 13; builds on the FR-2.5 week schedule. |
| FR-3.1, 3.2 | Phase 6 | |
| FR-3.3 (no meals/recipes generated) | Phase 6 | Negative requirement — satisfied by not building a meal/recipe generator; no dedicated test beyond absence of that feature surface. |
| FR-4.1–4.4 | Phase 4 | FR-4.4 parity now has measurable acceptance criteria (this revision). |
| FR-5.1–5.5 | Phase 7 | |
| FR-6.1–6.3 | Phase 8 | |
| FR-7.1–7.4 | Phase 9 | FR-7.1/7.4 now explicitly split into native/browser paths (this revision). |
| FR-8.1–8.3 | Phase 10 | |
| FR-8.4 (post-session summary) | Phase 10 (summary facts in `packages/core/src/progress/sessionSummary.ts`), Phase 11 (summary screen) | Added after Phase 11; shown after every session. |
| FR-8.5 (per-day body progress) | Phase 10 (`packages/core/src/progress/muscleCoverage.ts`), Phase 4 (`regionIntensity` heatmap and `regionLabels` on-model numbers props in `packages/three-model`, parity-tested), Phase 11 (`BodyProgressScreen`, the Progress tab's first screen) | Added after Phase 13; brings the training-volume heatmap into V1 scope (intent.md), but not recovery modelling. |
| FR-9.1 | Phase 2 | |
| FR-9.2 (password reset) | Phase 2 | Test coverage added this revision. |
| FR-9.3 | Phase 2 (stub), Phase 12 (complete) | |
| FR-9.4 (no guest mode) | Phase 2 | Test coverage added this revision. |

### Non-Functional Requirements (NFR)

| ID | Owning phase(s) | Notes |
|---|---|---|
| NFR-1 (consistency) | Phase 11 (verification), Phase 4 & Phase 9 (specific parity work) | |
| NFR-2 (3D performance) | Phase 4 | |
| NFR-3 (connectivity resilience) | Phase 7 | Previously unaddressed; owned this revision via `offlineQueue.ts`. |
| NFR-4 (consistent PR/progression calc) | Phase 7 (`logAggregation.ts`), Phase 8, Phase 10 | Previously at risk of divergence; now backed by one shared module. |
| NFR-5 (accessibility) | Phase 4 (fallback), Phase 13 (audit) | |
| NFR-6 (content maintainability) | Phase 3, Phase 9, Phase 0.5 (maintenance-owner requirement) | |
| NFR-7 (auditability) | Phase 5, Phase 6 | |

### Data Requirements (DR)

| ID | Owning phase(s) | Notes |
|---|---|---|
| DR-1 | Phase 3 | |
| DR-2 | Phase 9 | |
| DR-3 | Phase 1 (RLS) | |
| DR-4 | Phase 12 | |
| DR-5 (versioning) | Phase 1 (schema), Phase 5 & Phase 6 (generation-layer versioning) | Previously unowned; owned this revision. |
| DR-6 (weekdays, missed-session choices) | Phase 1 (schema: migration 0011, RLS), Phase 12 (re-audit) | Covered by the cross-user RLS tests in `supabase/tests/adversarial.test.mjs`. |

### UX Requirements

| ID | Owning phase(s) | Notes |
|---|---|---|
| UX-1 | Phase 2 (indicator component), Phase 11 (full flow) | Step-indicator component added this revision. |
| UX-2 | Phase 2 | |
| UX-3 | Phase 11 | |
| UX-4 | Phase 7 | |
| UX-5 | Phase 4 | |
| UX-6 | Phase 11 | |
| UX-7 | Phase 9 | |
| UX-8 (unit consistency) | Phase 6 (`packages/core/src/units/`), consumed by Phase 9, Phase 10 | Previously implemented ad hoc per screen; consolidated into one shared utility this revision. |
| UX-9 | Phase 11 | |

### Privacy & Security Requirements (PR)

| ID | Owning phase(s) | Notes |
|---|---|---|
| PR-1 | Phase 1 (adversarial tests), Phase 12 (re-audit) | |
| PR-2 (credential storage) | Phase 2 | Relies on Supabase Auth defaults; no dedicated custom test — acceptable given ADR-2, but not independently verified beyond Supabase's own guarantees. |
| PR-3 | Phase 12 | |
| PR-4 | Phase 12 | |
| PR-5 (no unnecessary PII in external lookups) | Phase 9 | Previously unowned; owned this revision via documented data-flow + outbound-payload test. |
| PR-6 (TLS) | Phase 12 | |
| PR-7 (compliance posture) | Open question, carried from `intent.md`/`spec.md` | Not resolvable within this plan — depends on target-market decision. |

### Safety Requirements (SR)

| ID | Owning phase(s) | Notes |
|---|---|---|
| SR-1, SR-2 | Phase 6 | |
| SR-3 (beginner exercise safety) | Phase 5 (implementation), Phase 12 (re-audit) | Previously unowned; owned this revision. |
| SR-4 | Phase 8 | |
| SR-5 | Phase 2 (implementation), Phase 12 (re-verify) | |
| SR-6 | Phase 5 | |

### AI Behavior Requirements (AI)

| ID | Owning phase(s) | Notes |
|---|---|---|
| AI-1–AI-4 | All phases (constraint) | No AI in any plan-number path. |
| AI-5 (AI summary text) | Phase 11 (`supabase/functions/session-insights`, `SessionSummary.tsx`), Phase 12 (re-audit) | Number check and rule-based fallback; the deployed function is a deferred production check. |

### Acceptance Criteria (AC)

| ID | Owning phase(s) |
|---|---|
| AC-1, AC-2, AC-3 | Phase 5 |
| AC-4, AC-5 | Phase 4 |
| AC-6, AC-7 | Phase 8 |
| AC-8 | Phase 7 (session storage), Phase 10 (PR contribution) |
| AC-9, AC-10 | Phase 9 |
| AC-11, AC-12 | Phase 10 |
| AC-13, AC-14 | Phase 2 (implementation), Phase 12 (integration-level verification) |
| AC-15 | Phase 11 |
| AC-16, AC-17 | Phase 11 |
| AC-18, AC-19 | Phase 5 (day planner, generator), Phase 11 (Plan screen editor) |
| AC-21, AC-22 | Phase 5 (month schedule logic), Phase 11 (Plan screen week/month views) |
| AC-20 | Phase 10 (coverage logic), Phase 11 (Body progress screen) |

## Previously Unowned Requirements (Now Addressed in This Revision)

- **SR-3** (beginner exercise safety) — no phase previously referenced it; now implemented in Phase 5 (`difficultyGating.ts`) and re-audited in Phase 12.
- **DR-5** (plan/target versioning) — no migration, field, or implementation note previously existed; now implemented at the schema level in Phase 1 (`0009_plan_target_versioning.sql`) and at the generation layer in Phase 5/Phase 6.
- **PR-5** (no unnecessary PII in external lookups) — not documented anywhere; now owned by Phase 9 with an explicit data-flow document and an outbound-payload test.
- **NFR-3** (connectivity resilience during workout logging) — surfaced during this revision's traceability check; no prior phase addressed local queuing/retry behavior; now owned by Phase 7 (`offlineQueue.ts`).

Additionally strengthened (previously owned but under-specified, tightened during the same traceability pass, not previously flagged as "unowned"):
- **NFR-4** (no divergent PR/progression calculations) — previously satisfied only by convention; now enforced structurally via a shared `logAggregation.ts` module used by both Phase 8 and Phase 10.
- **UX-8** (unit consistency) — previously implied per-screen; now consolidated into one shared `packages/core/src/units/` utility.
- **FR-9.2 / FR-9.4** — implemented in the original plan but had no explicit test coverage in Phase 2; test bullets added.
- **UX-1** (step-progress indicator) — implied by "guided flow" language but had no named component; `OnboardingProgressIndicator.tsx` added to Phase 2.

## Remaining Unresolved Questions

All open items are tracked in the **Unresolved Questions Blocking Specific Phases** table above (OQ-1 through OQ-14) and require sign-off no later than the phase listed. Of these, the following are genuinely new decisions this revision introduced rather than gaps it closed, and should get explicit attention early since they gate other work:

- **OQ-13** (licensing go/no-go outcomes) gates the start of Phase 3, Phase 4, and Phase 9 — this is now a hard dependency, not a soft assumption, so a negative outcome on any asset has immediate schedule impact and should be resourced early.
- **OQ-10** (3D parity numeric tolerance) needs a concrete threshold before Phase 4's parity suite can assert pass/fail rather than just report a delta.
- ~~**OQ-11** (connectivity retry policy specifics) needs a concrete policy (retry count/backoff, and what "permanently failed" looks like to the user) before Phase 7's resilience tests can be written precisely.~~ **Resolved in Phase 7** — see `/docs/decisions/OQ-11-connectivity-retry-policy.md`.
- **OQ-12** (exact PII allow-list for external lookups) needs sign-off from whoever owns PR-7's eventual compliance posture, since the two are related — a stricter compliance posture later may require a stricter allow-list than a minimal V1 implementation would otherwise choose.
- **PR-7** (regulatory compliance posture) remains explicitly out of this plan's scope, pending the target-market decision carried from `intent.md`; it is the one open item with no phase that can resolve it — it requires a product/business decision upstream of engineering.
