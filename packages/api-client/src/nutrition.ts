import {
  diffNutritionTargets,
  generateNutritionTargets,
  toComparableNutritionTargets,
  type ComparableNutritionTargets,
  type GeneratedNutritionTargets,
  type NutritionGeneratorInput,
  type NutritionTargetDiffSummary,
} from 'core';

import type { GymSupabaseClient } from './client';
import { getProfile, type ApiResult } from './profile';
import type { Database } from './types/database';

export type NutritionTargetsRow = Database['public']['Tables']['nutrition_targets']['Row'];

export interface PersistedNutritionTargets {
  id: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  targetVersion: number;
  effectiveFrom: string;
}

export interface NutritionRegenerationPreview {
  candidateTargets: GeneratedNutritionTargets;
  diffSummary: NutritionTargetDiffSummary;
  currentTargets: PersistedNutritionTargets | null;
}

function result<T>(data: T | null, error: { message: string } | null): ApiResult<T> {
  return { data, error: error ? error.message : null };
}

function toPersisted(row: NutritionTargetsRow): PersistedNutritionTargets {
  return {
    id: row.id,
    dailyCalories: row.daily_calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    targetVersion: row.target_version,
    effectiveFrom: row.effective_from,
  };
}

/** FR-2.4/DR-5: the signed-in user's currently active (non-superseded) nutrition targets, or null if none exist yet. */
export async function getCurrentNutritionTargets(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<PersistedNutritionTargets | null>> {
  const { data, error } = await client
    .from('nutrition_targets')
    .select('*')
    .eq('user_id', userId)
    .is('superseded_at', null)
    .order('target_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return result(null, error);
  }
  return { data: data ? toPersisted(data) : null, error: null };
}

/**
 * FR-3.1/DR-5: persists freshly generated targets as a brand-new,
 * insert-only target_version — never updates or deletes an existing
 * nutrition_targets row. target_version is deliberately omitted on insert
 * (the DB trigger assigns it and auto-supersedes the prior version, see
 * 0009_plan_target_versioning.sql), mirroring packages/api-client/src/plans.ts's
 * createWorkoutPlan.
 */
export async function createNutritionTargets(
  client: GymSupabaseClient,
  userId: string,
  targets: GeneratedNutritionTargets,
): Promise<ApiResult<PersistedNutritionTargets>> {
  const { data, error } = await client
    .from('nutrition_targets')
    .insert({
      user_id: userId,
      daily_calories: targets.dailyCalories,
      protein_g: targets.proteinG,
      carbs_g: targets.carbsG,
      fat_g: targets.fatG,
    })
    .select()
    .single();
  if (error || !data) {
    return result<PersistedNutritionTargets>(null, error ?? { message: 'Failed to create nutrition targets.' });
  }
  return { data: toPersisted(data), error: null };
}

async function fetchNutritionGeneratorInput(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<NutritionGeneratorInput>> {
  const profileRes = await getProfile(client, userId);
  if (profileRes.error) {
    return { data: null, error: profileRes.error };
  }
  if (!profileRes.data) {
    return { data: null, error: 'No profile found for this user; complete onboarding first.' };
  }
  const p = profileRes.data;
  return {
    data: {
      age: p.age,
      heightCm: p.height_cm,
      weightKg: p.weight_kg,
      biologicalSex: p.biological_sex,
      goal: p.goal,
      trainingDaysPerWeek: p.training_days_per_week,
    },
    error: null,
  };
}

/** AC-1: the user's first-ever nutrition targets — fetches profile data, generates, and persists. No diff needed (nothing preceded it). */
export async function generateInitialNutritionTargets(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<PersistedNutritionTargets>> {
  const inputRes = await fetchNutritionGeneratorInput(client, userId);
  if (inputRes.error || !inputRes.data) {
    return { data: null, error: inputRes.error ?? 'Failed to assemble nutrition generator input.' };
  }
  const targets = generateNutritionTargets(inputRes.data);
  return createNutritionTargets(client, userId, targets);
}

/**
 * FR-2.4/Flow 2.7: builds the candidate next targets (pure, in-memory,
 * zero writes) from the user's CURRENT profile, and diffs them against
 * the user's current persisted targets. Shared by both the profile-edit
 * regeneration prompt (FR-1.4) and any on-demand regenerate action, so
 * both entry points compute the identical candidate the same way.
 * Guaranteed not to call insert/update/delete on any table.
 */
export async function buildNutritionRegenerationPreview(
  client: GymSupabaseClient,
  userId: string,
): Promise<ApiResult<NutritionRegenerationPreview>> {
  const [inputRes, currentRes] = await Promise.all([
    fetchNutritionGeneratorInput(client, userId),
    getCurrentNutritionTargets(client, userId),
  ]);
  if (inputRes.error || !inputRes.data) {
    return { data: null, error: inputRes.error ?? 'Failed to assemble nutrition generator input.' };
  }
  if (currentRes.error) {
    return { data: null, error: currentRes.error };
  }

  const candidateTargets = generateNutritionTargets(inputRes.data);
  const currentTargets = currentRes.data;
  const previousComparable: ComparableNutritionTargets | null = currentTargets
    ? {
        dailyCalories: currentTargets.dailyCalories,
        proteinG: currentTargets.proteinG,
        carbsG: currentTargets.carbsG,
        fatG: currentTargets.fatG,
      }
    : null;
  const diffSummary = diffNutritionTargets(previousComparable, toComparableNutritionTargets(candidateTargets));

  return { data: { candidateTargets, diffSummary, currentTargets }, error: null };
}
