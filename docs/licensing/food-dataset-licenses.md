# Food dataset licensing — go/no-go record (Phase 0.5, for Phase 9)

**Status: licensing review complete for generic foods — awaiting the
owner's go/no-go sign-off** in `/docs/licensing/go-no-go-checklist.md`.
Barcode/packaged-product data is **not** covered by this record (see
"Out of scope" below).

## Source

- **Dataset**: USDA FoodData Central — **SR Legacy** (Standard Reference,
  final 2018 release), the long-standing USDA reference table of generic
  foods ("Bananas, raw", "Chicken, broilers or fryers, breast, meat only,
  cooked, roasted").
- **Publisher**: U.S. Department of Agriculture, Agricultural Research
  Service — https://fdc.nal.usda.gov/download-datasets
- **File imported**: `FoodData_Central_sr_legacy_food_csv_2018-04.zip`
  (6,074,592 bytes, SHA-256
  `b80817294b8850530aaedf2e515c02593b1824f763a0ff356e5c2081643e6fd0`),
  downloaded 2026-10-31.
- **What is vendored**: not the raw release (~45 MB of CSV), but the
  derived per-100 g macro table this app uses —
  `/data/food/source/usda_sr_legacy_macros.json` (7,448 foods: name,
  kcal, protein, carbohydrate, fat; baby foods excluded) — produced by
  `/data/food/scripts/importUsdaFoods.ts`, which also generates
  `/supabase/seed/food_items_seed.sql`.

## The six Phase 0.5 checks

| Check | Finding |
|---|---|
| **Commercial/use license** | ✅ FoodData Central data is published by a U.S. federal agency as public domain, dedicated under **CC0 1.0 Universal** (stated on the FoodData Central site). Commercial use is permitted without restriction. |
| **Redistribution rules** | ✅ CC0 places no restriction on storing, re-hosting, transforming or redistributing the data, so a derived copy in this app's own database is fine. |
| **Attribution requirements** | Not legally required under CC0. USDA *requests* a citation ("U.S. Department of Agriculture, Agricultural Research Service. FoodData Central."), and this app shows a credit line on the food search screen (`apps/app/features/nutrition/FoodSearchScreen.tsx`) as good practice. |
| **Offline/local storage** | ✅ Permitted. The data is seeded into the `food_items` table and queried there. No live call to USDA happens at runtime (satisfies DR-1, and keeps PR-5/OQ-12 untouched: nothing user-related leaves the app). |
| **API usage restrictions** | None apply. This is a one-off bulk download, not the FoodData Central API, so there is no API key, rate limit or pricing (R-4 not triggered). |
| **Maintenance strategy** | SR Legacy is frozen (USDA's final release, 2018), so values won't change upstream. Owner: the project owner. Cadence: no scheduled re-import is needed for SR Legacy; if Foundation Foods (USDA's actively updated successor) is added later, re-run `npm run content:import-foods -- <csv dir>` per release and review the diff (NFR-6). |

## Data handling notes

- Values are USDA's per-100 g edible-portion figures. Energy uses nutrient
  1008 ("Energy", kcal), falling back to the Atwater variants
  (2047/2048) when 1008 is absent. A missing macro is stored as 0.
- Every food is seeded with `portion_description = '100g'`, so the diary
  can ask for an amount in grams directly
  (`apps/app/features/nutrition/DiaryScreen.tsx`).
- USDA's "(Includes foods for USDA's Food Distribution Program)" name
  suffix is stripped. Names are otherwise USDA's own.
- Row ids are deterministic (UUID v5 of the USDA `fdc_id`), so re-importing
  updates rows in place and never orphans users' logged entries.

## Out of scope: barcodes / packaged products

SR Legacy has no barcodes. Barcode lookup still queries only this app's
`food_items` table: users' custom foods, plus five fictional demo products
in `/supabase/seed/food_items_barcode_demo_seed.sql`, kept only so the scan
flow is testable. A real barcode source (e.g. Open Food Facts, ODbL
share-alike with attribution and live-lookup implications) needs its own
licensing review here **and** the deferred OQ-12 privacy decision
(`/docs/decisions/OQ-12-external-lookup-allowlist.md`) before integration.

## Hosted database note

Re-applying the seeds to an existing project upserts the USDA rows. It does
**not** delete the 20 old hand-authored placeholder generic foods
(ids `00000000-0000-4000-8000-000000000001` through `…000000000020`), because
users' food log entries may reference them. Remove them deliberately once
nothing references them, or keep them as-is.
