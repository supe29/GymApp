# Release Checklist (Phase 13)

Per `plan.md` Phase 13: final quality pass and readiness sign-off for a V1
release. This checklist is honest about what was verified in this
development environment (no Docker, no Deno runtime, no device/simulator, no
real Supabase project — see `/docs/deferred-production-checks.md`) versus
what remains a genuine pre-submission blocker.

## Acceptance Criteria (AC-1 through AC-14)

All fourteen are verified at the component/integration/DB-harness level,
cross-platform by construction (every screen is built from
`react-native`/`react-native-web` primitives with no platform branch outside
the two documented exceptions — see `docs/qa/web-mobile-parity-checklist.md`)
and additionally smoke-tested in a real browser for the unauthenticated
surface (see `/e2e/README.md`). None have been run against a real device or a
real Supabase backend — that gap is tracked, not hidden, in
`/docs/deferred-production-checks.md`.

| ID | Criterion | Verified by | Status |
|---|---|---|---|
| AC-1 | Plan + targets generated on onboarding completion | `apps/app/features/plan/onboardingToPlan.integration.test.tsx` | ✅ Component-level |
| AC-2 | No prescribed exercise needs undeclared equipment | `packages/core/src/content/exerciseQueries.test.ts`, `planGenerator.test.ts`, re-confirmed adversarially in Phase 12 (`plans.test.ts`'s SR-6 test) | ✅ Component-level |
| AC-3 | Goal edit prompts regenerate; decline leaves plan/targets unchanged | `apps/app/features/plan/RegeneratePlanPrompt.test.tsx`, `packages/core`'s `versioning.test.ts` (plan + nutrition) | ✅ Component-level |
| AC-4 | Muscle selection shows only tagged exercises | `exerciseQueries.test.ts`, `apps/app/features/muscle-explorer/MuscleExplorerScreen.test.tsx` | ✅ Component-level |
| AC-5 | Non-visual fallback reaches the same browsing capability | `MuscleListFallback.test.tsx`; Phase 13's accessibility audit (`docs/qa/accessibility-audit.md`) independently re-confirmed the fallback drives the identical filter pipeline | ✅ Component-level |
| AC-6 | Completed prescribed sets produce a progression suggestion | `packages/core/src/progression/evaluateSession.test.ts`, `apps/app/features/workout-session/SessionScreen.test.tsx` | ✅ Component-level |
| AC-7 | Failed/under-performed set never suggests a weight increase (SR-4) | `evaluateSession.test.ts`'s combinatorial sweep, re-confirmed adversarially in Phase 12 (`plans.test.ts`) | ✅ Component-level |
| AC-8 | Freeform session appears in history and counts toward PRs | `FreeformSessionScreen.test.tsx`, `WorkoutHistoryScreen.test.tsx`, `packages/core/src/progress/prCalculator.test.ts` | ✅ Component-level |
| AC-9 | Found barcode logs correct values, totals update | `packages/api-client/src/foodLog.test.ts`, `barcodeLookup.test.ts`, `apps/app/features/nutrition/DiaryScreen.test.tsx`, `packages/core/src/nutrition/dailyTotals.test.ts` | ✅ Component-level |
| AC-10 | Not-found barcode routes to manual entry, never a dead end | `BarcodeScanScreen.web.test.tsx`, `ManualBarcodeEntry.test.tsx` | ✅ Component-level |
| AC-11 | New heaviest set flags a new PR immediately | `prCalculator.test.ts`, `apps/app/features/progress/NewPersonalRecordCard.test.tsx` | ✅ Component-level |
| AC-12 | Two+ weight entries render a trend chart in the correct unit system | `apps/app/features/progress/WeightTrendScreen.test.tsx` | ✅ Component-level |
| AC-13 | Account deletion leaves zero residual rows, including superseded versions | `supabase/tests/adversarial.test.mjs`'s dedicated AC-13 suite, against a real Postgres engine (PGlite) with the actual RLS policies applied | ✅ DB-harness level |
| AC-14 | Onboarding cannot complete without disclaimer acknowledgment | `apps/app/features/profile/ProfileSetupFlow.test.tsx`, `DisclaimerScreen.test.tsx` | ✅ Component-level |

Full current pass counts: `npm test` → 77 suites / 630 tests passing;
`npm run typecheck` → clean; `npm run test:db` → 52/52 passing (adversarial
RLS + DR-5 + AC-13 + Phase 3 content-quality suite, all against PGlite).

## End-to-end suite (web + native)

- **Web** (`/e2e/`, Playwright): `npm run e2e` → 7/7 passing against the real
  Expo web build in a real Chromium browser (see `/e2e/README.md` for exact
  scope) — navigation/UI-level smoke coverage of the
  unauthenticated surface (spec.md flow 2.1's entry point), explicitly not a
  real-backend-integrated run. Flows 2.2–2.7, and the backend-dependent part
  of 2.1, are instead covered by the Jest/`@testing-library/react-native`
  integration suite (see `/e2e/README.md`'s flow→test-file mapping).
- **Native** (`/e2e/native/`, Detox): written against real `testID`s and
  Detox's documented API for all seven flows, **never executed** — no
  Xcode/Android SDK/simulator/Detox CLI in this environment. See
  `/e2e/native/README.md`.

## Accessibility (NFR-5)

Full code-level audit completed in Phase 13 — see
`docs/qa/accessibility-audit.md`: accessibility roles/labels/states added
across all 32 screens that lacked them, two real WCAG AA contrast failures
found and fixed (`WorkoutPlanScreen.tsx`, `SessionScreen.tsx`), the 3D
model's non-visual fallback (`MuscleListFallback.tsx`) confirmed to reach
identical functionality to the 3D path. **Not** verified: a real
screen-reader pass (VoiceOver/TalkBack/NVDA) on an actual device — tracked in
`/docs/deferred-production-checks.md`.

## Performance (NFR-2)

No reference-device profiling has been performed in this environment (no
device/simulator). Tracked in `/docs/deferred-production-checks.md` — folds
into the existing 3D-model performance verification item, since the 3D model
is NFR-2's only explicitly named performance-sensitive surface.

## Open Questions — final pass

Every Open Question carried across `intent.md`, `spec.md`, and `plan.md` is
now either resolved or explicitly deferred with a recorded decision — none
are silently left open:

| OQ | Status |
|---|---|
| OQ-1 (safe calorie floor) | Resolved, Phase 6 — `/docs/decisions/OQ-1-safe-calorie-floor.md` |
| OQ-2 (muscle taxonomy) | Resolved, Phase 3 — `/docs/decisions/OQ-2-muscle-group-taxonomy.md` |
| OQ-3 (progression increment) | Resolved, Phase 8 — `/docs/decisions/OQ-3-progression-increment-rule.md` |
| OQ-4 (PR calculation) | Resolved, Phase 10 — `/docs/decisions/OQ-4-pr-calculation-method.md` |
| OQ-5 (session rescheduling) | Explicitly deferred past V1, Phase 13 — `/docs/decisions/OQ-5-session-rescheduling.md` |
| OQ-6 (biological sex field) | Resolved, Phase 2 — `/docs/decisions/OQ-6-biological-sex.md` |
| OQ-7 (custom food promotion) | Explicitly deferred — not required for V1 (`plan.md`'s own table) |
| OQ-8 (SR-2 thresholds) | Resolved, Phase 6 — `/docs/decisions/OQ-1-safe-calorie-floor.md` |
| OQ-9 (data export) | Explicitly deferred past V1, Phase 13 — `/docs/decisions/OQ-9-data-export.md` |
| OQ-10 (3D parity tolerance) | Resolved, Phase 4 (recorded Phase 13) — `/docs/decisions/OQ-10-3d-parity-tolerance.md` |
| OQ-11 (connectivity retry policy) | Resolved, Phase 7 — `/docs/decisions/OQ-11-connectivity-retry-policy.md` |
| OQ-12 (external lookup allow-list) | Explicitly deferred, Phase 13 — `/docs/decisions/OQ-12-external-lookup-allowlist.md` |
| OQ-13 (licensing go/no-go) | Resolved (exercise dataset + 3D mesh signed off; food dataset explicitly deferred with sign-off). Update 2026-10-31: generic foods now USDA FoodData Central, review recorded, **owner sign-off pending**; barcode data still unreviewed. Update 2026-11-01: 3D mesh replaced by Z-Anatomy (CC BY-SA, signed off); **before store release, confirm BodyParts3D derivative terms with DBCLS** (see `/docs/licensing/anatomical-mesh-license.md`) — `/docs/licensing/go-no-go-checklist.md` |
| OQ-14 (plan version revert) | Resolved, Phase 13 — `/docs/decisions/OQ-14-plan-version-revert.md` |

`intent.md`-carried strategic open questions (target market/region,
data-privacy/compliance posture pending market, notification strategy,
monetization model, future AI coaching layer) remain explicitly open by
design — these are business decisions out of this plan's scope, not
oversights, and are listed as such in `spec.md` §11.

## Is the app ready to submit/deploy?

**Not yet — gated on `/docs/deferred-production-checks.md`.** Every
acceptance criterion, safety requirement, and open question is resolved or
explicitly deferred at the code/design level, and the full test suite passes
in this environment. A real hosted Supabase project now exists and two of
that list's items are genuinely closed against it (migrations/seeds applied,
`database.ts` diffed, real auth + cross-user RLS smoke-tested — see
`/docs/deferred-production-checks.md`'s "Real Supabase Auth/PostgREST
integration" entry for specifics and residue). Still missing: the
delete-account edge function has still never executed (no Deno runtime
here), OAuth providers are unconfigured on the real project, and this
environment has never had Docker, an iOS/Android build or simulator, a real
screen reader, real app store developer accounts, or real branded store
assets. `/docs/deferred-production-checks.md` is the authoritative, itemized list of
what must be executed for real before production sign-off — nothing on that
list should be checked off without actually performing the verification it
describes.
