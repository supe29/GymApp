import type { ScheduleAdjustment } from 'core';

import type { GymSupabaseClient } from './client';
import type { ApiResult } from './profile';
import type { Database } from './types/database';

export type ScheduleAdjustmentRow = Database['public']['Tables']['schedule_adjustments']['Row'];

export interface PersistedScheduleAdjustment extends ScheduleAdjustment {
  id: string;
  workoutPlanId: string;
  weekStart: string;
}

function toPersisted(row: ScheduleAdjustmentRow): PersistedScheduleAdjustment {
  return {
    id: row.id,
    workoutPlanId: row.workout_plan_id,
    weekStart: row.week_start,
    plannedSessionId: row.planned_session_id,
    action: row.action,
    targetDate: row.target_date,
    mergeIntoPlannedSessionId: row.merge_into_planned_session_id,
  };
}

/** FR-2.6: the user's missed-session choices for one plan version and week. */
export async function getScheduleAdjustments(
  client: GymSupabaseClient,
  userId: string,
  workoutPlanId: string,
  weekStart: string,
): Promise<ApiResult<PersistedScheduleAdjustment[]>> {
  const { data, error } = await client
    .from('schedule_adjustments')
    .select('*')
    .eq('user_id', userId)
    .eq('workout_plan_id', workoutPlanId)
    .eq('week_start', weekStart);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map(toPersisted), error: null };
}

/** FR-2.8: the user's choices for one plan version across a run of weeks (inclusive Monday bounds), for the month view. */
export async function getScheduleAdjustmentsInRange(
  client: GymSupabaseClient,
  userId: string,
  workoutPlanId: string,
  fromWeekStart: string,
  toWeekStart: string,
): Promise<ApiResult<PersistedScheduleAdjustment[]>> {
  const { data, error } = await client
    .from('schedule_adjustments')
    .select('*')
    .eq('user_id', userId)
    .eq('workout_plan_id', workoutPlanId)
    .gte('week_start', fromWeekStart)
    .lte('week_start', toWeekStart);
  if (error) return { data: null, error: error.message };
  return { data: (data ?? []).map(toPersisted), error: null };
}

export interface CreateScheduleAdjustmentInput {
  workoutPlanId: string;
  weekStart: string;
  plannedSessionId: string;
  action: ScheduleAdjustment['action'];
  targetDate?: string | null;
  mergeIntoPlannedSessionId?: string | null;
}

/** FR-2.6: records one choice (skip, move to a date, or merge into another session). */
export async function createScheduleAdjustment(
  client: GymSupabaseClient,
  userId: string,
  input: CreateScheduleAdjustmentInput,
): Promise<ApiResult<PersistedScheduleAdjustment>> {
  const { data, error } = await client
    .from('schedule_adjustments')
    .insert({
      user_id: userId,
      workout_plan_id: input.workoutPlanId,
      week_start: input.weekStart,
      planned_session_id: input.plannedSessionId,
      action: input.action,
      target_date: input.targetDate ?? null,
      merge_into_planned_session_id: input.mergeIntoPlannedSessionId ?? null,
    })
    .select()
    .single();
  if (error || !data) return { data: null, error: error ? error.message : 'Failed to save your choice.' };
  return { data: toPersisted(data), error: null };
}

/** FR-2.6: undoes a choice. */
export async function deleteScheduleAdjustment(
  client: GymSupabaseClient,
  userId: string,
  id: string,
): Promise<ApiResult<null>> {
  const { error } = await client.from('schedule_adjustments').delete().eq('id', id).eq('user_id', userId);
  return { data: null, error: error ? error.message : null };
}
