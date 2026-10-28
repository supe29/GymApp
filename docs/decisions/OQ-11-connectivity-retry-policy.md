# OQ-11: Local-queue/retry policy for connectivity drops during workout logging (NFR-3)

**Status:** Resolved in Phase 7, per plan.md's own assignment ("OQ-11 ... | Phase 7"). Unlike
OQ-1/OQ-6/OQ-8, this question is `plan.md`-only — it does not appear in `spec.md`'s Open Questions
list (`spec.md`'s OQ- series stops at OQ-9), so only `plan.md`'s tracking table is updated by this
resolution, not `spec.md`.

## Decision

**Reconnect signal:** no connectivity-detection library (no `@react-native-community/netinfo` or
equivalent) is added. Retries run on a **timed exponential backoff** — 2s, 4s, 8s, 16s, capped at
60s thereafter — regardless of actual network state, plus an **immediate flush** whenever the app
returns to the foreground (`AppState`'s `'active'` event), as a "maybe reconnected" nudge. This is
implemented in `apps/app/features/workout-session/offlineQueue.ts`.

**Give-up policy:** a queued set is **never auto-discarded**. After 5 consecutive sync failures it
is labeled `'failed'` ("Couldn't sync") in `SetLogger.tsx`'s UI so the user isn't left thinking it
silently succeeded, but background retries keep running indefinitely at the capped 60s interval.
Only an explicit user action (`discard()`) removes an entry from the queue.

**Idempotent retries:** each logged set is assigned a client-generated UUID (`generateLocalId()`,
a non-cryptographic `Math.random`-based v4) **before** any network attempt. `workoutSessions.ts`'s
`logSet` persists using `.upsert(payload, { onConflict: 'id' })` rather than `.insert()`, so
retrying after an ambiguous prior attempt (one that may have actually succeeded server-side, but
whose response the client never saw) is always safe — it confirms the existing row rather than
erroring on a duplicate or creating a second one.

## Rationale

- **Why not NetInfo?** `NetInfo` would make the "connectivity returned" signal more precise
  (reacting to the actual network state change rather than a timer or a foreground event), but it
  is a new native dependency requiring `expo install` and config-plugin verification, for a V1
  feature that a capped exponential backoff plus a foreground nudge already covers adequately:
  spec.md's NFR-3 only requires surviving *brief* drops, not instant reconnection detection.
  Consistent with `intent.md`'s V1 scope-discipline constraint, this avoids adding infrastructure
  the literal requirement doesn't demand.
- **Why never auto-discard?** NFR-3's wording is explicit: "brief connectivity drops ... must not
  silently discard already-entered sets." Any time-based or attempt-count-based auto-removal would
  violate that literally — a user who stepped away from connectivity for longer than the designed
  retry window would silently lose data. Continuing to retry indefinitely (even if slowly) and
  requiring an explicit discard is the only policy that can never silently drop a set.
- **Why a 5-failure "Couldn't sync" label rather than staying silently "pending" forever?** A
  queued set that always displays as "pending" even after many real-world minutes would mislead
  the user into believing sync is imminent when it may not be. Surfacing a distinct, user-visible
  state after a reasonable number of failures (without actually stopping retries) balances honesty
  about the situation against the "never discard" guarantee.
- **Why client-generated ids + upsert, rather than insert + catch-the-duplicate-error?** A
  connectivity drop can happen *after* the server has committed the write but *before* the client
  receives the success response — from the client's perspective this is indistinguishable from a
  failed write. An `insert` retry in that case would hit the table's implicit primary-key
  uniqueness and surface as an error requiring special-case handling to detect and treat as
  success. `upsert` keyed on a client-chosen id sidesteps the ambiguity entirely: the retry is
  textually identical regardless of which case occurred.

## Alternatives considered

| Option | Rejected because |
|---|---|
| `@react-native-community/netinfo` for true connectivity-change events | New native dependency and config-plugin risk for a V1 feature that backoff + foreground-nudge already covers; spec.md only requires surviving brief drops, not instant reconnection. |
| Give up after N attempts and show a dismissible error | A dismissed/stopped-retrying entry is one step from being lost if the user doesn't manually resync — conflicts with NFR-3's "must not silently discard" wording. |
| Server-generated ids with `insert` + duplicate-error detection | Requires special-casing a unique-constraint violation as a success signal; a client-generated id + `upsert` makes retries unambiguous by construction instead. |

## Consequences

- `apps/app/features/workout-session/offlineQueue.ts` owns this policy; `SetLogger.tsx` surfaces
  the resulting `pending` / `syncing` / `failed` ("Couldn't sync") states with a manual retry
  affordance, never a silent failure.
- `packages/api-client/src/workoutSessions.ts`'s `logSet` is `upsert`-based, not `insert`-based —
  any future caller of `logSet` must supply a stable, pre-generated `id`, not rely on the database
  to generate one.
- A dedicated connectivity-resilience test (`offlineQueue.test.ts`) simulates a failed-then-succeeded
  sync and asserts the entry survives in the queue the entire time, never silently dropped — this
  is the concrete, testable form of NFR-3's requirement, not just a design intention.
- `plan.md`'s Unresolved Questions table's OQ-11 row is marked resolved, pointing here.
