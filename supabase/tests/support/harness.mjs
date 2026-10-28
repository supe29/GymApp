// Local, Docker-free harness for exercising the RLS policies and DR-5
// triggers defined in /supabase/migrations against a real Postgres engine
// (PGlite: Postgres compiled to WASM), with a minimal shim replicating
// the parts of Supabase's managed environment those migrations assume
// (see ./auth-shim.sql for exactly what and why).
//
// This is a stand-in for `supabase test db` / `supabase db reset` against
// the real local Supabase stack, which requires Docker (unavailable in
// this environment). Once Docker is available, the canonical way to run
// these checks is the Supabase CLI against the real stack; this harness
// exists so the same policies and triggers can still be verified for real
// in the meantime, rather than only reviewed statically.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const AUTH_SHIM_PATH = path.resolve(__dirname, './auth-shim.sql');

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Boots a fresh in-memory PGlite instance, applies the auth shim, then
 * applies every migration in /supabase/migrations in filename order.
 * Throws immediately if any migration fails to apply.
 */
export async function bootDatabase() {
  const db = new PGlite();
  await db.exec(readFileSync(AUTH_SHIM_PATH, 'utf8'));

  const applied = [];
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
      applied.push(file);
    } catch (err) {
      throw new Error(`Migration ${file} failed to apply: ${err.message}`);
    }
  }

  // Mirrors the real Supabase platform default (service_role has
  // unrestricted table access) now that the migrations have created the
  // tables; see the comment in auth-shim.sql for why this can't happen
  // before the migrations run.
  await db.exec(`
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
    grant all on all tables in schema auth to service_role;
  `);

  return { db, applied };
}

const SEED_PATH = path.resolve(__dirname, '../../seed/exercises_seed.sql');

/** Applies /supabase/seed/exercises_seed.sql (Phase 3 content) as the superuser role. */
export async function applyExerciseSeed(db) {
  await db.exec(readFileSync(SEED_PATH, 'utf8'));
}

/** Runs `sql` as the bootstrapping superuser role, which bypasses RLS — for test setup/assertions, not for the behavior under test. */
export async function asSuperuser(db, sql, params = []) {
  await db.query('reset role');
  return db.query(sql, params);
}

/** Runs `sql` as if it arrived through PostgREST authenticated as `userId`. */
export async function asUser(db, userId, sql, params = []) {
  await db.query('set role authenticated');
  await db.query("select set_config('request.jwt.claim.role', 'authenticated', false)");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await db.query(sql, params);
  } finally {
    await db.query('reset role');
  }
}

/** Runs `sql` as an unauthenticated (anon) request. */
export async function asAnon(db, sql, params = []) {
  await db.query('set role anon');
  await db.query("select set_config('request.jwt.claim.role', 'anon', false)");
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  try {
    return await db.query(sql, params);
  } finally {
    await db.query('reset role');
  }
}

/** Runs `sql` as the service_role (bypasses RLS by role attribute, per auth-shim.sql). */
export async function asServiceRole(db, sql, params = []) {
  await db.query('set role service_role');
  await db.query("select set_config('request.jwt.claim.role', 'service_role', false)");
  try {
    return await db.query(sql, params);
  } finally {
    await db.query('reset role');
  }
}

/** Creates an auth.users row and a matching profiles row for a fresh test user; returns the user's id. */
export async function seedUser(db, overrides = {}) {
  const { rows } = await asSuperuser(db, 'insert into auth.users default values returning id');
  const userId = rows[0].id;
  await asSuperuser(
    db,
    `insert into public.profiles
      (user_id, age, height_cm, weight_kg, biological_sex, fitness_level, goal, training_days_per_week)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      overrides.age ?? 30,
      overrides.heightCm ?? 175,
      overrides.weightKg ?? 75,
      overrides.biologicalSex ?? 'prefer_not_to_say',
      overrides.fitnessLevel ?? 'beginner',
      overrides.goal ?? 'general_fitness',
      overrides.trainingDaysPerWeek ?? 3,
    ],
  );
  return userId;
}
