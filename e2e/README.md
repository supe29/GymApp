# End-to-end suite (Phase 13)

## Scope: signed-out navigation + client-side validation only

This suite drives the real web app (via `expo start --web`) in a real
Chromium browser with Playwright. It covers exactly:

- The app loading to the Sign In screen by default (spec.md flow 2.1's
  entry point).
- Navigation across every signed-out screen reachable from
  `apps/app/navigation/AuthNavigator.tsx`: Sign In ↔ Sign Up, Sign In ↔
  Forgot Password, Sign Up ↔ Privacy Policy.
- Zero-network client-side validation on Sign In, Sign Up, and Forgot
  Password (the "enter an email/password" guards that run *before* any
  Supabase call).

It deliberately does **not** submit real credentials, trigger OAuth, or
exercise anything behind authentication.

## Why it stops there

The app always talks to a real Supabase client
(`apps/app/lib/supabaseClient.ts` → `createGymClient()`), and this sandbox
has no Docker/Supabase CLI to run a real backend — the same root cause
already tracked in `docs/deferred-production-checks.md` under "Real
Supabase Auth/PostgREST integration." Building a mock backend or network
interception layer to fake a full sign-up → plan-generation → logging
flow in a real browser was considered and explicitly declined in favor of
this smaller, honest scope: this suite proves the signed-out UI actually
works in a real browser; it does not claim to prove backend-integrated
behavior that it has no way to exercise here.

`playwright.config.ts` starts the Expo web dev server with placeholder
Supabase credentials (`EXPO_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`).
This is safe specifically because every screen this suite visits only
calls `supabase-js`'s `getSession()` on mount, which reads local storage
and returns `null` immediately when there's no cached session — it never
makes a network request in that case, so the placeholder URL is never
actually dialed.

## What covers the rest of spec.md §2's user flows instead

Every flow that requires an authenticated session is covered by the
existing Jest + `@testing-library/react-native` component/integration
suite, not by this Playwright suite:

| Flow | Test file(s) |
|---|---|
| 2.1 Sign Up & Onboarding (profile → plan → targets → disclaimer) | `apps/app/features/plan/onboardingToPlan.integration.test.tsx`, `apps/app/features/profile/ProfileSetupFlow.test.tsx`, `apps/app/features/onboarding/OnboardingFlow.test.tsx` |
| 2.2 First Workout Session (plan-attached) | `apps/app/features/workout-session/SessionScreen.test.tsx` |
| 2.3 Freeform Workout Session | `apps/app/features/workout-session/FreeformSessionScreen.test.tsx` |
| 2.4 Muscle Exploration | `apps/app/features/muscle-explorer/MuscleExplorerScreen.test.tsx`, `apps/app/features/muscle-explorer/MuscleListFallback.test.tsx` |
| 2.5 Food Logging | `apps/app/features/nutrition/DiaryScreen.test.tsx`, `apps/app/features/nutrition/FoodSearchScreen.test.tsx`, `apps/app/features/nutrition/CustomFoodForm.test.tsx`, `apps/app/features/nutrition/BarcodeScanScreen.web.test.tsx`, `apps/app/features/nutrition/ManualBarcodeEntry.test.tsx` |
| 2.6 Progress Review | `apps/app/features/progress/WeightTrendScreen.test.tsx`, `apps/app/features/progress/PersonalRecordsScreen.test.tsx` |
| 2.7 Plan Update (profile change) | `apps/app/features/plan/RegeneratePlanPrompt.test.tsx` |

Those tests mock `packages/api-client` (same boundary the real app calls
through) rather than a real Supabase project, so they exercise real
component logic without needing live infrastructure either — this suite
and that suite are deliberately complementary, not overlapping.

## Running it

From the repo root:

```
npm run e2e
```

or directly:

```
npx playwright test -c e2e/playwright.config.ts
```

`playwright.config.ts`'s `webServer` block starts `expo start --web` on
port 8099 itself (with `CI=1` so Metro doesn't watch/reload) and waits for
it to respond before running specs — no manual server startup needed. Run
`npx playwright install chromium` once beforehand if the browser binary
isn't already cached locally.
