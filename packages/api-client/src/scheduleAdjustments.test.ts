import { updateTrainingWeekdays } from './profile';
import {
  createScheduleAdjustment,
  deleteScheduleAdjustment,
  getScheduleAdjustments,
  type ScheduleAdjustmentRow,
} from './scheduleAdjustments';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

const row: ScheduleAdjustmentRow = {
  id: 'adj-1',
  user_id: 'user-1',
  workout_plan_id: 'plan-1',
  planned_session_id: 'ps-1',
  week_start: '2026-11-09',
  action: 'move',
  target_date: '2026-11-11',
  merge_into_planned_session_id: null,
  created_at: '2026-11-11T08:00:00Z',
};

describe('schedule adjustments (FR-2.6)', () => {
  test('lists one plan version and week, scoped to the user', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: [row], error: null });
    from.mockReturnValueOnce(builder);

    const result = await getScheduleAdjustments(client, 'user-1', 'plan-1', '2026-11-09');

    expect(from).toHaveBeenCalledWith('schedule_adjustments');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.eq).toHaveBeenCalledWith('workout_plan_id', 'plan-1');
    expect(builder.eq).toHaveBeenCalledWith('week_start', '2026-11-09');
    expect(result.data?.[0]).toMatchObject({ id: 'adj-1', plannedSessionId: 'ps-1', action: 'move', targetDate: '2026-11-11' });
  });

  test('creates a choice, sending null for unused fields', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: { ...row, action: 'skip', target_date: null }, error: null });
    from.mockReturnValueOnce(builder);

    const result = await createScheduleAdjustment(client, 'user-1', {
      workoutPlanId: 'plan-1',
      weekStart: '2026-11-09',
      plannedSessionId: 'ps-1',
      action: 'skip',
    });

    expect(builder.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      workout_plan_id: 'plan-1',
      week_start: '2026-11-09',
      planned_session_id: 'ps-1',
      action: 'skip',
      target_date: null,
      merge_into_planned_session_id: null,
    });
    expect(result.data?.action).toBe('skip');
  });

  test('passes errors through', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(createQueryBuilderMock({ data: null, error: { message: 'duplicate key value' } }));
    const result = await createScheduleAdjustment(client, 'user-1', {
      workoutPlanId: 'p',
      weekStart: 'w',
      plannedSessionId: 's',
      action: 'skip',
    });
    expect(result.error).toBe('duplicate key value');
  });

  test('deletes by id, scoped to the user', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: null, error: null });
    from.mockReturnValueOnce(builder);

    expect(await deleteScheduleAdjustment(client, 'user-1', 'adj-1')).toEqual({ data: null, error: null });
    expect(builder.eq).toHaveBeenCalledWith('id', 'adj-1');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});

describe('updateTrainingWeekdays (FR-2.5)', () => {
  test('saves the weekdays sorted and de-duplicated', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: { training_weekdays: [1, 3, 5] }, error: null });
    from.mockReturnValueOnce(builder);

    await updateTrainingWeekdays(client, 'user-1', [5, 1, 3, 3]);

    expect(builder.update).toHaveBeenCalledWith({ training_weekdays: [1, 3, 5] });
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
