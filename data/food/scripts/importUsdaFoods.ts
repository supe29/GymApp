// Phase 9: import USDA FoodData Central "SR Legacy" generic foods (public
// domain / CC0, per /docs/licensing/food-dataset-licenses.md) into
// /supabase/seed/food_items_seed.sql.
//
// Two steps, mirroring data/exercises' vendored-source pattern:
//
// 1. Extract (only when a CSV directory is passed): read the raw SR Legacy
//    CSV release (~45 MB unzipped, too large to vendor) and write the
//    compact per-100g macro table this app actually uses to
//    /data/food/source/usda_sr_legacy_macros.json (vendored).
// 2. Generate (always): turn that vendored JSON into the seed SQL.
//
// Run with:
//   npm run content:import-foods                      (regenerate SQL from vendored JSON)
//   npm run content:import-foods -- <path/to/csv/dir> (re-extract from a fresh USDA download first)
//
// The CSV release is FoodData_Central_sr_legacy_food_csv_2018-04.zip from
// https://fdc.nal.usda.gov/download-datasets (see the licensing record for
// the exact checksum that was vendored).
//
// Idempotent: ids are deterministic UUID v5s of the USDA fdc_id, and the
// generated SQL upserts (`on conflict (id) do update`), so re-running
// corrects values in place rather than duplicating rows (NFR-6).

import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { v5 as uuidv5 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(__dirname, '../../..');
const VENDORED_JSON = path.join(DATA_DIR, 'source/usda_sr_legacy_macros.json');

// Fixed, arbitrary namespace for food content IDs. Never change this —
// changing it would re-key every seeded food and orphan logged entries.
const NAMESPACE = '3b2f6c1e-9a4d-4f7b-8e21-5d0c7a9b4e63';

// USDA nutrient ids (nutrient.csv). Energy prefers the classic "Energy"
// (1008); a handful of foods only report the Atwater variants.
const NUTRIENT_ENERGY_KCAL = ['1008', '2047', '2048'];
const NUTRIENT_PROTEIN_G = '1003';
const NUTRIENT_FAT_G = '1004';
const NUTRIENT_CARBS_G = '1005';

/** Food categories (food_category.csv ids) left out: not something an adult fitness user logs. */
const EXCLUDED_CATEGORY_IDS = new Set(['3' /* Baby Foods */]);

export interface UsdaFood {
  fdcId: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Minimal RFC 4180 line parser (USDA CSVs quote every field; no embedded newlines). */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function forEachCsvRow(file: string, onRow: (row: Record<string, string>) => void): Promise<void> {
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const line of lines) {
    if (line.trim() === '') continue;
    const fields = parseCsvLine(line);
    if (!header) {
      header = fields;
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = fields[i] ?? '';
    });
    onRow(row);
  }
}

/** Drops USDA's procurement-program annotation, which adds length but no meaning for a user. */
function cleanName(description: string): string {
  return description.replace(/\s*\(Includes foods for USDA's Food Distribution Program\)/i, '').trim();
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

async function extract(csvDir: string): Promise<UsdaFood[]> {
  const foods = new Map<string, { name: string; categoryId: string }>();
  await forEachCsvRow(path.join(csvDir, 'food.csv'), (row) => {
    foods.set(row.fdc_id, { name: cleanName(row.description), categoryId: row.food_category_id });
  });

  const nutrients = new Map<string, Map<string, number>>();
  const wanted = new Set([...NUTRIENT_ENERGY_KCAL, NUTRIENT_PROTEIN_G, NUTRIENT_FAT_G, NUTRIENT_CARBS_G]);
  await forEachCsvRow(path.join(csvDir, 'food_nutrient.csv'), (row) => {
    if (!wanted.has(row.nutrient_id)) return;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) return;
    const perFood = nutrients.get(row.fdc_id) ?? new Map<string, number>();
    perFood.set(row.nutrient_id, amount);
    nutrients.set(row.fdc_id, perFood);
  });

  const result: UsdaFood[] = [];
  let skippedNoEnergy = 0;
  for (const [fdcId, food] of foods) {
    if (EXCLUDED_CATEGORY_IDS.has(food.categoryId)) continue;
    const n = nutrients.get(fdcId) ?? new Map<string, number>();
    const kcal = NUTRIENT_ENERGY_KCAL.map((id) => n.get(id)).find((v) => v != null);
    if (kcal == null) {
      skippedNoEnergy += 1;
      continue;
    }
    // SR Legacy reports values per 100 g edible portion. A macro absent
    // from the release (rare; e.g. carbs for some pure fats) is 0.
    result.push({
      fdcId,
      name: food.name,
      kcal: round1(kcal),
      proteinG: round1(n.get(NUTRIENT_PROTEIN_G) ?? 0),
      carbsG: round1(n.get(NUTRIENT_CARBS_G) ?? 0),
      fatG: round1(n.get(NUTRIENT_FAT_G) ?? 0),
    });
  }
  result.sort((a, b) => Number(a.fdcId) - Number(b.fdcId));
  console.log(`  extracted ${result.length} foods (skipped ${skippedNoEnergy} with no energy value)`);
  return result;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function generateSeed(foods: UsdaFood[]): string {
  const lines: string[] = [];
  lines.push('-- GENERATED FILE — do not hand-edit.');
  lines.push('-- Produced by data/food/scripts/importUsdaFoods.ts (npm run content:import-foods).');
  lines.push(`-- Source: USDA FoodData Central SR Legacy (${foods.length} generic foods, values per 100 g),`);
  lines.push('-- public domain (CC0) per /docs/licensing/food-dataset-licenses.md.');
  lines.push('-- Safe to re-run: ids are deterministic (uuid v5 of the USDA fdc_id) and rows upsert.');
  lines.push('');
  lines.push('begin;');
  lines.push('');
  lines.push('insert into public.food_items');
  lines.push(
    '  (id, name, brand, barcode, portion_description, calories_per_portion, protein_g_per_portion, carbs_g_per_portion, fat_g_per_portion, source, created_by_user_id)',
  );
  lines.push('values');
  lines.push(
    foods
      .map(
        (f, i) =>
          `  (${sqlString(uuidv5(`food:usda-sr-legacy:${f.fdcId}`, NAMESPACE))}, ${sqlString(f.name)}, null, null, '100g', ${f.kcal}, ${f.proteinG}, ${f.carbsG}, ${f.fatG}, 'external', null)${i === foods.length - 1 ? '' : ','}`,
      )
      .join('\n'),
  );
  lines.push(
    'on conflict (id) do update set name = excluded.name, portion_description = excluded.portion_description, calories_per_portion = excluded.calories_per_portion, protein_g_per_portion = excluded.protein_g_per_portion, carbs_g_per_portion = excluded.carbs_g_per_portion, fat_g_per_portion = excluded.fat_g_per_portion;',
  );
  lines.push('');
  lines.push('commit;');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const csvDir = process.argv[2];
  if (csvDir) {
    const foods = await extract(path.resolve(csvDir));
    writeFileSync(VENDORED_JSON, `${JSON.stringify(foods)}\n`, 'utf8');
    console.log(`Wrote ${VENDORED_JSON}`);
  }
  const foods: UsdaFood[] = JSON.parse(readFileSync(VENDORED_JSON, 'utf8'));
  const outPath = path.join(REPO_ROOT, 'supabase/seed/food_items_seed.sql');
  writeFileSync(outPath, generateSeed(foods), 'utf8');
  console.log(`Wrote ${outPath} (${foods.length} foods)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
