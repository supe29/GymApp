-- DEMO barcode products — hand-authored, fictional ("Acme" brands), NOT a
-- licensed product database. Kept only so the barcode scan / manual
-- barcode entry flow (BarcodeScanScreen, ManualBarcodeEntry) has something
-- to find while no real barcode source is integrated: that integration is
-- gated on the deferred OQ-12 decision (docs/decisions/OQ-12-external-lookup-allowlist.md)
-- and a licensing sign-off in docs/licensing/go-no-go-checklist.md.
-- Do not ship real users against these rows.
--
-- Generic foods come from the USDA import in food_items_seed.sql instead.
-- Safe to re-run: ids are fixed, insert uses `on conflict (id) do update`.

begin;

insert into public.food_items
  (id, name, brand, barcode, portion_description, calories_per_portion, protein_g_per_portion, carbs_g_per_portion, fat_g_per_portion, source, created_by_user_id)
values
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
