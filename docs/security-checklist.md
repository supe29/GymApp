# Security, Privacy & Safety Checklist (Phase 12)

Per `plan.md` Phase 12: this is a **re-audit**, not a first audit. Every
requirement below was already implemented and unit-tested by the phase that
owns it (per `plan.md`'s Requirements Traceability table); this checklist
records where each one was re-confirmed, and is honest about which checks
are still only verified at the harness/component level rather than against
a real deployed Supabase project — those gaps are tracked in
`/docs/deferred-production-checks.md`, not hidden here.

## Privacy Requirements (PR-1–PR-7)

| ID | Requirement | Status | Where verified |
|---|---|---|---|
| PR-1 | Health-adjacent personal data readable only by its owner | ✅ Re-confirmed | `supabase/tests/adversarial.test.mjs` — "RLS: cross-user rejection on every user-scoped table" and "RLS: unauthenticated (anon) access is rejected outright" exercise every user-scoped table (`profiles`, `user_equipment`, `workout_plans`, `planned_sessions`, `planned_session_exercises`, `workout_sessions`, `set_logs`, `progression_suggestions`, `weight_entries`, `nutrition_targets`, `food_log_entries`, `personal_records`) against a real Postgres engine with the actual RLS policies from `supabase/migrations/0008_rls_policies.sql` applied. Still only run against the PGlite harness (see `supabase/tests/support/harness.mjs`), not a live Supabase project — tracked as "Real Supabase Auth/PostgREST integration" in `deferred-production-checks.md`. |
| PR-2 | Secure credential storage and session handling | ✅ By managed platform | `packages/api-client/src/auth.ts`: `signUpWithEmail`/`signInWithEmail`/`updatePassword` pass the password straight to the Supabase SDK call in the same statement — no `console.log`/logging anywhere in this file, and no variable holding a password outlives the call. `apps/app/features/auth/SignInScreen.tsx`/`SignUpScreen.tsx`/`ResetPasswordScreen.tsx`: the password lives only in local React state, cleared on unmount, never written to storage. Session (not password) persistence is via `AsyncStorage` on native / `localStorage` default on web (`apps/app/lib/supabaseClient.ts:12-21`) — the Supabase JS client's own default, not a platform keychain; noted for completeness, not a finding. `expo-secure-store` is not used anywhere in the repo. Verify against a real project per the OAuth items in `deferred-production-checks.md`. |
| PR-3 | Privacy policy disclosed before/during account creation | ✅ Implemented this phase | `apps/app/features/legal/PrivacyPolicyScreen.tsx`, linked from `SignUpScreen` (`signup-privacy-policy`) via a new `PrivacyPolicy` route in `AuthNavigator.tsx`. Covered by `PrivacyPolicyScreen.test.tsx`, `SignUpScreen.test.tsx`, and an `AuthNavigator.test.tsx` navigation round-trip. |
| PR-4 | In-app account/data deletion, honored not just hidden | ✅ Re-confirmed | Mechanism: `supabase/functions/delete-account/index.ts` (Phase 2) calls `auth.admin.deleteUser`, which cascades through `profiles` and every FK in migrations 0001–0009. Completeness: new test `AC-13: account deletion leaves zero residual rows across every user-scoped table` in `supabase/tests/adversarial.test.mjs` seeds every table (including a superseded `workout_plans` version, a superseded `nutrition_targets` version, and a user-created private `food_items` row) and asserts zero rows remain anywhere after deleting the `auth.users` row. The edge function itself still has never been executed (no Deno/Docker in this environment) — tracked in `deferred-production-checks.md`. |
| PR-5 | No selling/sharing personal data; external lookups avoid PII | ✅ Re-confirmed | `docs/privacy/external-lookup-data-flow.md` (Phase 9): zero external network calls exist today (placeholder `food_items` seed data only), and the required contract for any future real integration is documented. Nothing to re-audit beyond re-reading that document, since no code path currently sends anything externally. |
| PR-6 | Data-in-transit encrypted (HTTPS/TLS) | ✅ By managed platform | Repo-wide search found no hardcoded `http://` production endpoint anywhere — the only `http://` hits are `supabase/config.toml`'s local-dev-CLI-only entries (`api_url`/`site_url` at `http://127.0.0.1...`, and `[api.tls] enabled = false`, which governs the local dev stack, not the hosted `*.supabase.co` endpoint). `packages/api-client/src/client.ts` constructs the client from `EXPO_PUBLIC_SUPABASE_URL` with no scheme hardcoded; `.env.example` ships blank. All client calls go through `@supabase/supabase-js` against whatever `https://` project URL is configured. Confirm against the actual project URL once provisioned (see `deferred-production-checks.md`'s "Real Supabase Auth/PostgREST integration" item). |
| PR-7 | Regulatory compliance posture (GDPR, data residency, etc.) | ⚠️ Open — not resolved here | Carried from `intent.md`/`spec.md` as an explicit open question dependent on target market. PR-1–PR-6 above are the baseline regardless of how PR-7 resolves. Not silently closed by this checklist. |

## Safety Requirements (SR-1–SR-6)

| ID | Requirement | Status | Where verified |
|---|---|---|---|
| SR-1 | Calorie targets never below the safe floor | ✅ Re-confirmed | `packages/core/src/nutrition/safetyLimits.ts` + `safetyLimits.test.ts`, floor values resolved in `docs/decisions/OQ-1-safe-calorie-floor.md` (1200 kcal female / 1500 kcal male / 1500 kcal `prefer_not_to_say`). `nutritionGenerator.test.ts` re-exercises the floor through the full generation path. Additionally re-exercised through the real `packages/api-client` function this pass: `nutrition.test.ts`'s `"SR-1 adversarial: an extreme low-weight/aggressive-deficit/high-training-volume profile is clamped to the sex-specific safe floor before being persisted"` drives `generateInitialNutritionTargets` with an adversarial profile and asserts the actual DB insert payload is clamped to 1200 kcal — not a mocked/canned value. |
| SR-2 | Unsafe goal configurations surfaced with a warning | ✅ Re-confirmed, bug found and fixed this pass | `packages/core/src/nutrition/macroCalculator.ts`/`.test.ts` and `nutritionGenerator.ts`/`.test.ts` implement and test the aggressive-deficit + high-volume warning path. **Bug found**: `generateInitialNutritionTargets` (`packages/api-client/src/nutrition.ts`, was line ~124) computed `unsafeConfigurationWarning` but discarded it before returning — `NutritionTargetsScreen.tsx`'s regenerate-preview path (line 84) surfaced the warning correctly, but the first-time "Generate my targets" path (`handleGenerateInitial`) never did, so a user triggering SR-2 on their very first generation saw no warning at all. **Fixed**: `generateInitialNutritionTargets` now returns an `InitialNutritionTargets` type carrying `unsafeConfigurationWarning` (computed from the same generation call, still never persisted to the DB — no column exists for it), and `handleGenerateInitial` now calls `setWarningBanner(result.data.unsafeConfigurationWarning)`. Covered by a new regression test in `NutritionTargetsScreen.test.tsx` and a new adversarial test in `nutrition.test.ts` (`"SR-2 adversarial: ..."`) asserting the warning reaches the caller through the real function and is never written to the insert payload. |
| SR-3 | Beginners gated away from high-skill compound lifts | ✅ Re-confirmed | `packages/core/src/planning/rules/difficultyGating.ts` + `difficultyGating.test.ts`, re-exercised end-to-end through `planGenerator.test.ts`. Additionally re-exercised through the real `packages/api-client` function this pass: `plans.test.ts`'s `"SR-3 adversarial: a beginner profile never gets an advanced exercise when a safer alternative targets the same muscle group"` drives `generateInitialPlan` with a 2-exercise library (one beginner, one advanced, same muscle group) and asserts the actual `planned_session_exercises` insert payload excludes the advanced one. |
| SR-4 | Progressive overload never increases after a missed/failed set | ✅ Re-confirmed | `packages/core/src/progression/evaluateSession.ts` + `evaluateSession.test.ts`, including a dedicated combinatorial regression test ("no fixture with any missed set across a wide combinatorial sweep ever suggests an increase") and `applyProgressionOverlay.test.ts`. Additionally re-exercised through the real overlay read path this pass: `plans.test.ts`'s `"SR-4 adversarial: an accepted hold suggestion (produced after a missed set) leaves targetWeightKg and targetRepsMin unchanged through the real overlay"` drives `getPlannedSessionById` with a `hold`-action suggestion and asserts the overlaid prescription is unchanged, not just that `increase_weight` applies correctly (the only case previously covered at this layer). |
| SR-5 | Non-medical-device disclaimer shown during onboarding, gating completion | ✅ Re-confirmed | `apps/app/features/legal/DisclaimerScreen.tsx`, gating `ProfileSetupFlow.tsx` (`ProfileSetupFlow.test.tsx` exercises the gate at the flow-integration level, not just the standalone screen) — see AC-14 below. |
| SR-6 | Never recommends exercises requiring undeclared equipment | ✅ Re-confirmed | `packages/core/src/content/exerciseQueries.ts` + `exerciseQueries.test.ts`, re-exercised through `planGenerator.test.ts`'s full plan-generation path. Additionally re-exercised through the real `packages/api-client` function this pass: `plans.test.ts`'s `"SR-6 adversarial: an exercise requiring undeclared equipment is never prescribed when a bodyweight alternative exists"` drives `generateInitialPlan` with zero declared equipment and asserts the actual insert payload excludes the equipment-requiring exercise. |

All six Safety Requirements are re-confirmed at the `packages/core` unit/integration level. SR-1, SR-2, SR-3, SR-4, and SR-6 are additionally now exercised with adversarial inputs through the real `packages/api-client` functions the app actually calls (`generateInitialNutritionTargets`, `generateInitialPlan`, `getPlannedSessionById`) — only the Supabase query builder is mocked in these tests; the real `packages/core` logic runs for real and the assertions check the actual DB insert/overlay payload, not a canned mock echo. SR-5 remains covered at the `ProfileSetupFlow` UI-integration level (see AC-14). None of this has been re-run against a live deployed Supabase project — the entire stack is still harness/component-tested only, per `deferred-production-checks.md`.

## Acceptance Criteria

| ID | Criterion | Status | Where verified |
|---|---|---|---|
| AC-13 | Account deletion removes profile, logs, and weight entries | ✅ Re-confirmed | New `supabase/tests/adversarial.test.mjs` test, see PR-4 above. |
| AC-14 | Onboarding cannot complete without disclaimer acknowledgment | ✅ Re-confirmed | `ProfileSetupFlow.test.tsx` exercises the gate as part of the full profile-setup flow (not the `DisclaimerScreen` component in isolation). |

## Summary

No cross-user data leakage was found in this re-audit. All Safety
Requirements continue to hold in their owning packages and in the flows
that consume them. Gaps closed across this phase:

- PR-3: privacy policy was previously undisclosed in-app — now implemented.
- AC-13: previously only the per-table service-role-delete mechanism was
  tested, not an end-to-end "delete the account, check every table" pass
  including superseded version history — now covered.
- **SR-2 bug**: `generateInitialNutritionTargets` silently dropped the
  unsafe-configuration warning on first-time generation — fixed, and now
  covered by a regression test.
- SR-1, SR-2, SR-3, SR-4, SR-6: previously proven only in `packages/core`
  pure-function unit tests or (for SR-3/SR-6) through a full `core`-level
  generation path — now also exercised with adversarial inputs through the
  real `packages/api-client` functions the app calls, per Phase 12's
  explicit mandate to re-run these "not just in the isolated unit tests
  where they were first implemented."

Everything in this checklist that depends on a real deployed Supabase
project, a real Deno runtime, or a real device remains an open item in
`/docs/deferred-production-checks.md` — this checklist does not duplicate
or close those items, only points at them.
