# Deferred Integration Checks — Blockers for Production, Not for Development Phases

These items were verified only against mocks/static analysis in this development
environment (no Docker, no Deno runtime, no device/simulator, no real Supabase
project). They are **not blockers for proceeding to the next implementation
phase**, but every one of them **must** be executed and pass before a
production sign-off.

Recorded 2026 (Phase 2 acceptance). Owner: whoever performs production
readiness review — see plan.md Phase 12/13.

- [ ] **Real Google OAuth verification** — exercise `signInWithGoogle` against an
      actual configured Google OAuth client and Supabase project, not the
      mocked `performOAuthSignIn`.
- [ ] **Real Apple OAuth verification** — same, for Sign in with Apple.
- [ ] **Real OAuth redirect verification on device** — confirm the
      `expo-web-browser` / `expo-linking` redirect round-trip actually
      completes on a real iOS and Android device (deep link handling can't be
      verified by a component test).
- [ ] **Execute and verify the delete-account Edge Function**
      (`supabase/functions/delete-account/index.ts`) — written to match
      Supabase's documented pattern but never run; verify with
      `supabase functions serve` / a deployed function once Docker/Deno are
      available, including that it actually cascades and leaves zero residual
      rows (DR-4).
- [ ] **Real Supabase Auth/PostgREST integration** — every `GymSupabaseClient`
      call in `packages/api-client` has only been tested against a mock; run
      the full auth + profile flow against a real local (`supabase start`) or
      hosted Supabase project.
- [ ] **Regenerate and diff `database.ts`** — run
      `supabase gen types typescript --local` (or against a linked project)
      and diff against `packages/api-client/src/types/database.ts`, the
      hand-authored version. A real bug was already found and fixed in this
      file during Phase 2 (missing `Views`/`Functions`/`Enums`/`CompositeTypes`
      keys) — treat the hand-authored file as unverified until diffed.
- [ ] **Android runtime verification** — no Android SDK/emulator has been
      available in this environment since Phase 0; only `expo export` bundling
      has been verified, never an actual running app.
- [ ] **iOS runtime verification** — same, for iOS Simulator/device (no
      Xcode/macOS available in this environment).
- [ ] **Acquire and vendor the real 3D body mesh** — download the Mixamo
      "Y Bot"/"X Bot" base character (requires a free Adobe account — not
      available in this environment), convert to `.glb`, and replace the
      placeholder geometry in `packages/three-model/src/{web,native}/` per
      `docs/licensing/3d-mesh-license.md`. Phase 4's interaction
      contract/adapters/parity tests do not depend on the final art, so this
      can happen in parallel without blocking further phases.
- [ ] **3D model performance verification on reference devices** — NFR-2's
      "loads and becomes interactive within a few seconds" and "no
      perceptible lag" targets have not been measured on any real device
      (folds into the existing Android/iOS runtime verification items above).
- [ ] **SR-5 legal review, if required before production** — the disclaimer
      copy in `apps/app/features/legal/DisclaimerScreen.tsx` is a reasonable
      draft, not a legally reviewed text. Confirm with whoever owns
      compliance/legal risk whether a formal review is required before
      release, given the target market decision still outstanding (see
      spec.md/intent.md open questions on target market and PR-7).

## How to use this list

- Do not check an item off without actually performing the verification it
  describes.
- If a later phase (5, 6, 9, 12, 13) happens to perform one of these checks as
  part of its own work, mark it done here with a pointer to where it was
  verified, so this list stays authoritative for production sign-off.
