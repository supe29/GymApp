-- Phase 9 PLACEHOLDER seed data — hand-authored, NOT a licensed third-party
-- food database. Phase 0.5's food/barcode dataset licensing sign-off has
-- NOT happened yet (see /docs/licensing/go-no-go-checklist.md); this file
-- exists so Phase 9's search/barcode/logging features are testable without
-- that sign-off, per an explicit user decision to proceed against mock data
-- (dated 2026-10-28). Nutrition values below are rough, commonly-known
-- figures for generic foods — not sourced from any proprietary database.
--
-- When a real licensed source is integrated, this file is simply replaced
-- by a real import (mirroring exercises_seed.sql's generated-import
-- pattern) — no application code changes, since foodSearch.ts/
-- barcodeLookup.ts only ever query the food_items table, never this file.
--
-- Safe to re-run: ids are fixed, insert uses `on conflict (id) do update`.

begin;

insert into public.food_items
  (id, name, brand, barcode, portion_description, calories_per_portion, protein_g_per_portion, carbs_g_per_portion, fat_g_per_portion, source, created_by_user_id)
values
  ('00000000-0000-4000-8000-000000000001', 'Banana', null, null, '1 medium (118g)', 105, 1.3, 27, 0.4, 'external', null),
  ('00000000-0000-4000-8000-000000000002', 'Apple', null, null, '1 medium (182g)', 95, 0.5, 25, 0.3, 'external', null),
  ('00000000-0000-4000-8000-000000000003', 'Chicken Breast, cooked', null, null, '100g', 165, 31, 0, 3.6, 'external', null),
  ('00000000-0000-4000-8000-000000000004', 'White Rice, cooked', null, null, '1 cup (158g)', 205, 4.3, 45, 0.4, 'external', null),
  ('00000000-0000-4000-8000-000000000005', 'Broccoli, steamed', null, null, '1 cup (156g)', 55, 3.7, 11, 0.6, 'external', null),
  ('00000000-0000-4000-8000-000000000006', 'Large Egg', null, null, '1 egg (50g)', 72, 6.3, 0.4, 4.8, 'external', null),
  ('00000000-0000-4000-8000-000000000007', 'Rolled Oats, dry', null, null, '1/2 cup (40g)', 150, 5, 27, 3, 'external', null),
  ('00000000-0000-4000-8000-000000000008', 'Whole Milk', null, null, '1 cup (244g)', 149, 7.7, 11.7, 8, 'external', null),
  ('00000000-0000-4000-8000-000000000009', 'Salmon, cooked', null, null, '100g', 206, 22, 0, 13, 'external', null),
  ('00000000-0000-4000-8000-000000000010', 'Sweet Potato, baked', null, null, '1 medium (114g)', 103, 2.3, 24, 0.2, 'external', null),
  ('00000000-0000-4000-8000-000000000011', 'Almonds', null, null, '1 oz / 23 almonds (28g)', 164, 6, 6, 14, 'external', null),
  ('00000000-0000-4000-8000-000000000012', 'Avocado', null, null, '1/2 fruit (100g)', 160, 2, 8.5, 14.7, 'external', null),
  ('00000000-0000-4000-8000-000000000013', 'Greek Yogurt, plain nonfat', null, null, '1 cup (245g)', 133, 23, 9, 0.7, 'external', null),
  ('00000000-0000-4000-8000-000000000014', 'Black Beans, cooked', null, null, '1 cup (172g)', 227, 15, 41, 0.9, 'external', null),
  ('00000000-0000-4000-8000-000000000015', 'Peanut Butter', null, null, '2 tbsp (32g)', 188, 8, 6, 16, 'external', null),
  ('00000000-0000-4000-8000-000000000016', 'Whole Wheat Bread', null, null, '1 slice (28g)', 69, 3.6, 12, 1.1, 'external', null),
  ('00000000-0000-4000-8000-000000000017', 'Ground Beef, 90% lean, cooked', null, null, '100g', 176, 20, 0, 10, 'external', null),
  ('00000000-0000-4000-8000-000000000018', 'Spinach, raw', null, null, '1 cup (30g)', 7, 0.9, 1.1, 0.1, 'external', null),
  ('00000000-0000-4000-8000-000000000019', 'Olive Oil', null, null, '1 tbsp (14g)', 119, 0, 0, 13.5, 'external', null),
  ('00000000-0000-4000-8000-000000000020', 'Quinoa, cooked', null, null, '1 cup (185g)', 222, 8, 39, 3.6, 'external', null),
  ('00000000-0000-4000-8000-000000000021', 'Protein Bar, chocolate', 'Acme Nutrition', '012345678905', '1 bar (60g)', 220, 20, 22, 8, 'external', null),
  ('00000000-0000-4000-8000-000000000022', 'Granola Bar, oats & honey', 'Acme Pantry', '012345678912', '1 bar (35g)', 140, 3, 22, 4.5, 'external', null),
  ('00000000-0000-4000-8000-000000000023', 'Greek Yogurt Cup, strawberry', 'Acme Dairy', '012345678929', '1 cup (150g)', 130, 12, 17, 2, 'external', null),
  ('00000000-0000-4000-8000-000000000024', 'Sparkling Water, lime', 'Acme Beverages', '012345678936', '1 can (355ml)', 0, 0, 0, 0, 'external', null),
  ('00000000-0000-4000-8000-000000000025', 'Instant Oatmeal, cinnamon', 'Acme Pantry', '012345678943', '1 packet (43g)', 160, 4, 32, 2.5, 'external', null)
on conflict (id) do update set
  name = excluded.name,
  brand = excluded.brand,
  barcode = excluded.barcode,
  portion_description = excluded.portion_description,
  calories_per_portion = excluded.calories_per_portion,
  protein_g_per_portion = excluded.protein_g_per_portion,
  carbs_g_per_portion = excluded.carbs_g_per_portion,
  fat_g_per_portion = excluded.fat_g_per_portion,
  source = excluded.source,
  created_by_user_id = excluded.created_by_user_id;

commit;
