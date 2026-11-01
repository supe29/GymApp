# Content & Asset Licensing Go/No-Go Checklist (Phase 0.5)

Per plan.md Phase 0.5: no phase may begin implementation against a given
external asset until that asset's entry here is signed off. This checklist
was not completed when Phase 0.5 was originally defined (Phases 1–2
proceeded without needing it, since neither consumes an external content
asset); it is being filled in incrementally, gated in front of whichever
phase first needs each asset.

| Asset | Consuming phase | Status | Record |
|---|---|---|---|
| Exercise dataset | Phase 3 | ✅ Signed off (2026-09-29) | `/docs/licensing/exercise-dataset-license.md` |
| 3D mesh (muscle model) | Phase 4 | ✅ Signed off — GO (2026-09-29); **superseded 2026-11-01** by the anatomical mesh below | `/docs/licensing/3d-mesh-license.md` |
| Anatomical muscle mesh (Z-Anatomy, replaces the 3D mesh above) | Phase 4 | ✅ Signed off — GO (2026-11-01); owner chose Z-Anatomy and accepted CC BY-SA share-alike. Open: confirm BodyParts3D derivative terms with DBCLS before store release | `/docs/licensing/anatomical-mesh-license.md` (options: `/docs/licensing/anatomical-mesh-options.md`) |
| Generic foods (USDA FoodData Central SR Legacy) | Phase 9 | 🟡 Licensing review complete (2026-10-31) — **awaiting owner sign-off** | `/docs/licensing/food-dataset-licenses.md` |
| Barcode / packaged-product data | Phase 9 | ⏳ Not reviewed — no real source integrated; barcode lookup uses only custom foods + 5 fictional demo rows | To be completed (with OQ-12) before any real barcode source ships |

## Exercise dataset — summary

Signed off. See `/docs/licensing/exercise-dataset-license.md` for the full
record: source (`yuhonas/free-exercise-db`), license (Unlicense / public
domain, commercial use and redistribution both explicitly permitted), no
attribution required, safe to vendor/store locally, no live API dependency,
maintenance is manual re-import.

## Generic foods — summary (Phase 9)

Licensing review done; see `/docs/licensing/food-dataset-licenses.md`.
USDA FoodData Central SR Legacy is public domain (CC0): commercial use,
local storage and redistribution are all permitted, attribution is
requested (shown on the food search screen) but not required, and there is
no live API dependency. 7,448 generic foods replace the hand-authored
placeholder generic foods in `supabase/seed/food_items_seed.sql`.
**To sign off**, the project owner changes the status above to ✅ with a
date.

## Barcode data — note (Phase 9)

**Not signed off.** (The history below describes the original placeholder
decision from before the USDA import; it now applies to
barcode/packaged-product data only.) This asset's licensing review per this checklist's own
gate (candidate source evaluation, redistribution rules, attribution,
offline-storage permission, API/rate-limit restrictions, maintenance owner —
see Phase 0.5's requirements in `plan.md`) has not happened.

Per an explicit user decision on 2026-10-28, Phase 9's food search/barcode
scan/logging feature was implemented anyway, against a small hand-authored
placeholder dataset (`supabase/seed/food_items_seed.sql`) seeded directly
into the already-licensed, already-migrated `food_items` table — not a real
third-party database. `packages/api-client/src/foodSearch.ts` and
`barcodeLookup.ts` only ever query that table, so replacing the seed file
with a real, signed-off import later requires zero application code
changes. This is tracked in `/docs/deferred-production-checks.md` as a
production blocker: do not ship real users against this placeholder data.

## 3D mesh — summary

Signed off, GO. See `/docs/licensing/3d-mesh-license.md` for the full record:
primary source Mixamo (Adobe) base character, license permits commercial use
and bundling into web/native apps with no attribution required (only
redistributing the *raw* asset file as a standalone product is restricted,
which does not describe embedding it in this app); fallback source an
OpenGameArt CC0 humanoid if needed; fallback-of-last-resort is ADR-3's static
2D muscle map. The binary asset itself requires a credentialed manual
download (tracked in `/docs/deferred-production-checks.md`) and was not
fetched in this sandbox; Phase 4 engineering proceeds against placeholder
geometry in the meantime.
