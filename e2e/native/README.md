# Native E2E Suite (Detox) — Phase 13

Per `plan.md` Phase 13: "Full end-to-end suite across all seven user flows on
all three platforms." `/e2e/` (Playwright) covers the web platform's
navigation/UI-level surface — see `/e2e/README.md` for why it's scoped the
way it is. This directory is the **iOS/Android** counterpart, written against
[Detox](https://wix.github.io/Detox/)'s documented API and this app's real
`testID`s, matching the `supabase/functions/delete-account/index.ts` /
`BarcodeScanScreen.native.tsx` precedent in this repo: **written to run for
real, never actually executed in this environment.**

## Why these specs have never run

Detox requires, at minimum:

1. A native build of the app (`expo prebuild` + an Xcode/Gradle build, or an
   EAS build artifact) — this sandbox has no Xcode, no Android SDK, and no
   EAS credentials (same gap already tracked for the Android/iOS runtime
   verification items in `docs/deferred-production-checks.md`).
2. A running iOS Simulator or Android Emulator.
3. Detox's own CLI (`detox build`, `detox test`) and native test-runner
   framework linked into the build — never installed or invoked here.
4. Unlike the web Playwright suite, these specs exercise **real
   authenticated flows** (sign-up through to dashboard, workout logging, food
   logging, etc.) — there is no UI-only-safe subset the way there was for the
   signed-out web screens, because every flow past sign-up requires a live
   session. That in turn requires a real Supabase project
   (`EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` pointing at an
   actual backend, not a placeholder), which is the same "Real Supabase
   Auth/PostgREST integration" gap already tracked in
   `docs/deferred-production-checks.md`.

None of that is available here. These specs are written against this app's
actual `testID`s (verified by reading the real screen source, not guessed)
and Detox's real, documented API, so that once a native build + real backend
are available, running them should require configuration, not rewriting.

## Layout

- `.detoxrc.js` — Detox configuration: two configurations
  (`ios.sim.debug`, `android.emu.debug`), each pointing at the Expo
  prebuild output paths Detox expects (`ios/build/.../AIFitnessCoach.app`,
  `android/app/build/.../app-debug.apk`) — update these paths to match
  whatever `expo prebuild` actually produces once it's run for real; they are
  the conventional Expo bare-workflow output locations, not verified against
  an actual build in this environment.
- `jest.config.js` — the Jest-circus runner config Detox's CLI expects.
- `specs/*.e2e.ts` — one file per `spec.md` §2 user flow (2.1–2.7).

## How to actually run this, once the above is available

```sh
cd e2e/native
detox build -c ios.sim.debug   # or android.emu.debug
detox test -c ios.sim.debug
```

Each spec's `beforeAll` creates a fresh test account via the real sign-up UI
(email pattern `e2e+<timestamp>@example.test`) rather than relying on a
seeded fixture user, since no test-account seeding mechanism exists yet —
whoever wires this up for real should consider adding one (e.g. a
service-role test-user-factory edge function) rather than creating a new
real Supabase Auth user on every CI run.
