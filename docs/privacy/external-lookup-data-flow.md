# External Food/Barcode Lookup Data Flow (PR-5)

Per `spec.md` PR-5: "External data lookups (e.g., barcode/food lookups) must
not transmit personally identifying user information as part of the lookup
where avoidable." This document records what actually happens today, and
the allow-list contract any future real integration must satisfy.

## Current state (Phase 9, as built)

**There are zero external network calls in this feature today.** Per the
licensing-gate note in `/docs/licensing/go-no-go-checklist.md`, Phase 9 was
implemented against a hand-authored placeholder dataset
(`supabase/seed/food_items_seed.sql`) seeded into this app's own `food_items`
Supabase table. `packages/api-client/src/foodSearch.ts`'s `searchFoodItems`
and `barcodeLookup.ts`'s `lookupFoodByBarcode` both query only that table,
through this app's own Supabase project, the same way every other
user-scoped query in `packages/api-client` does (authenticated, RLS-scoped).
No third party receives a search query or a scanned barcode.

PR-5 is therefore vacuously satisfied today — there is nothing to leak,
because there is nowhere else the data goes. This will change the moment a
real external food/barcode source is integrated (see
`/docs/licensing/go-no-go-checklist.md`'s open item), which is why the
contract below exists now, ahead of that integration.

## Required contract for any future real external integration

When a real licensed food/barcode source replaces the placeholder seed data,
the lookup call (whatever `foodSearch.ts`/`barcodeLookup.ts` becomes) MUST:

- Send **only** the minimal data needed to perform the lookup:
  - A free-text search query string, or
  - A scanned/entered barcode value (digits only).
- **Never** include, directly or indirectly: the user's id, email, profile
  data (age, sex, weight, goals), location/IP-derived location, device
  identifiers, or any other field that could identify the user to the third
  party.
- Not attach any authentication/session token that identifies this app's
  user to the third-party request (a service-level API key for the
  third-party service itself is fine; a per-user token is not).

## Open question — not resolved by this document

**OQ-12** (`plan.md`'s Unresolved Questions table / `spec.md`): the *exact*
allow-list of fields permitted in a real external lookup payload, and the
retention period for any lookup logging, is still open. Per `plan.md`'s own
note, this may need input from whoever eventually owns PR-7's compliance
posture — a stricter future compliance stance could require a narrower
allow-list than the minimal one above. This document does not resolve OQ-12;
it only records the current (no-external-call) state and the baseline
contract above. Resolve OQ-12 explicitly (with its own decision doc, per
this repo's convention) before wiring up a real external source.
