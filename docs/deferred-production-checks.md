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
- [ ] **Execute the delete-account Edge Function itself**
      (`supabase/functions/delete-account/index.ts`) — written to match
      Supabase's documented pattern but never run as a Deno function; verify
      with `supabase functions serve` / a deployed function once Docker/Deno
      are available (auth-header handling, the two-client pattern, HTTP
      status codes). The cascade-completeness part of this item (that
      deleting `auth.users` actually leaves zero residual rows across every
      table, including superseded `plan_version`/`target_version` history)
      is now verified — see Phase 12's `AC-13` test in
      `supabase/tests/adversarial.test.mjs` and `docs/security-checklist.md`.
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
- [ ] **Native barcode scanning verification (Phase 9)** — `apps/app/features/nutrition/BarcodeScanScreen.native.tsx` (expo-camera) has not been executed on a real iOS/Android device, same gap as the three-model native adapter above. The web adapter's real camera/`BarcodeDetector` logic IS exercised by `BarcodeScanScreen.web.test.tsx` (mocked `getUserMedia`/`BarcodeDetector`), but that is still not a real-browser verification.
- [ ] **Real food/barcode dataset licensing and integration (Phase 9)** — `supabase/seed/food_items_seed.sql` is a small hand-authored placeholder dataset, not a licensed third-party source; Phase 0.5's food/barcode go/no-go sign-off (`docs/licensing/go-no-go-checklist.md`) was never completed. `foodSearch.ts`/`barcodeLookup.ts` only ever query the `food_items` table, so swapping in a real licensed import requires no application code changes — but the licensing review itself, and replacing the seed file with a real import, must happen before production.
- [ ] **Real on-device web/mobile parity verification (Phase 11, NFR-1)** — `docs/qa/web-mobile-parity-checklist.md`'s "required line items" (the 3D muscle model's native adapter, and native barcode scanning) are verified structurally/by-code-review only, same gap as their individual Phase 4/Phase 9 entries above. The full screen-by-screen review in that checklist found no other platform-exclusive code path, but none of it has been exercised on a real iOS/Android device.
- [ ] **SR-5 legal review, if required before production** — the disclaimer
      copy in `apps/app/features/legal/DisclaimerScreen.tsx` is a reasonable
      draft, not a legally reviewed text. Confirm with whoever owns
      compliance/legal risk whether a formal review is required before
      release, given the target market decision still outstanding (see
      spec.md/intent.md open questions on target market and PR-7).
- [ ] **Execute the native (iOS/Android) Detox e2e suite (Phase 13)** —
      `/e2e/native/specs/*.e2e.ts` cover all seven `spec.md` §2 user flows
      against real `testID`s and Detox's documented API, but have never run:
      no Xcode/Android SDK, no Detox CLI, and no native build artifact exist
      in this environment (folds into the existing Android/iOS runtime
      verification items above). Additionally requires a real Supabase
      project (same "Real Supabase Auth/PostgREST integration" gap above),
      since unlike the web Playwright suite there is no UI-only-safe subset
      once past sign-up. See `/e2e/native/README.md`.
- [ ] **Real app icon, splash screen, and store listing graphics** —
      `apps/app/assets/icon.png` and the other asset files are still the
      default Expo-scaffold placeholder artwork (a generic blue "A" mark on
      a blueprint grid), not real branded assets. `apps/app/app.json` now has
      real store metadata (name "AI Fitness Coach", slug, description,
      provisional bundle identifier/package `com.aifitnesscoach.app`), but
      ships with placeholder imagery — design real icon/splash/adaptive-icon
      assets, and screenshots for each store's listing requirements, before
      submission.
- [ ] **Reserve real bundle identifier / package name and developer
      accounts** — `com.aifitnesscoach.app` (`apps/app/app.json`'s
      `ios.bundleIdentifier`/`android.package`) is a provisional placeholder,
      not registered with an Apple Developer or Google Play Console account
      (neither exists in this environment). Confirm availability and
      register before any real build/submission.
- [ ] **Real-device accessibility (NFR-5) pass** — `docs/qa/accessibility-audit.md`
      (Phase 13) is a structural/code-level pass (accessibility labels,
      roles, contrast values reviewed in source); it has not been verified
      with an actual screen reader (VoiceOver/TalkBack) on a real device,
      same category of gap as the Android/iOS runtime verification items
      above.
- [ ] **NFR-2 performance spot checks on reference devices** — Phase 13's
      "load/performance spot checks" requirement is not separately
      verifiable here beyond the existing "3D model performance verification
      on reference devices" item above, which already covers it; no other
      performance-sensitive surface (list rendering, chart rendering) has
      been profiled on real hardware either.

## How to use this list

- Do not check an item off without actually performing the verification it
  describes.
- If a later phase (5, 6, 9, 12, 13) happens to perform one of these checks as
  part of its own work, mark it done here with a pointer to where it was
  verified, so this list stays authoritative for production sign-off.
