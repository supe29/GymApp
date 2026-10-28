import {
  completeWorkoutSession,
  getSetLogsForSession,
  getWorkoutSessionHistory,
  logSet,
  startWorkoutSession,
  type WorkoutSessionRow,
} from './workoutSessions';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

const fakeSessionRow: WorkoutSessionRow = {
  id: 'session-1',
  user_id: 'user-1',
  planned_session_id: 'planned-1',
  workout_plan_id: 'plan-1',
  status: 'in_progress',
  started_at: '2026-01-01T00:00:00Z',
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

const fakeSetLogRow = {
  id: 'set-1',
  workout_session_id: 'session-1',
  user_id: 'user-1',
  exercise_id: 'ex-1',
  set_index: 1,
  weight_kg: 50,
  reps: 10,
  rpe: null,
  logged_at: '2026-01-01T00:05:00Z',
};

describe('startWorkoutSession (FR-5.2)', () => {
  test('inserts a session without ever setting workout_plan_id directly', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: fakeSessionRow, error: null });
    from.mockReturnValueOnce(builder);

    const result = await startWorkoutSession(client, 'user-1', 'planned-1');

    expect(from).toHaveBeenCalledWith('workout_sessions');
    const insertedPayload = (builder.insert as jest.Mock).mock.calls[0][0];
    expect(insertedPayload).not.toHaveProperty('workout_plan_id');
    expect(insertedPayload.planned_session_id).toBe('planned-1');
    expect(result.data?.status).toBe('in_progress');
  });

  test('omits planned_session_id (sets it null) for a freeform session', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: { ...fakeSessionRow, planned_session_id: null, workout_plan_id: null }, error: null });
    from.mockReturnValueOnce(builder);

    await startWorkoutSession(client, 'user-1');

    const insertedPayload = (builder.insert as jest.Mock).mock.calls[0][0];
    expect(insertedPayload.planned_session_id).toBeNull();
  });
});

describe('logSet (FR-5.1/NFR-3)', () => {
  test('uses upsert keyed on id, not insert, for idempotent retries', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: fakeSetLogRow, error: null });
    from.mockReturnValueOnce(builder);

    const result = await logSet(client, 'user-1', {
      id: 'set-1',
      workoutSessionId: 'session-1',
      exerciseId: 'ex-1',
      setIndex: 1,
      weightKg: 50,
      reps: 10,
      rpe: null,
    });

    expect(builder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'set-1', user_id: 'user-1' }),
      { onConflict: 'id' },
    );
    expect(builder.insert).not.toHaveBeenCalled();
    expect(result.data?.id).toBe('set-1');
  });

  test('retrying the same id is a no-op success, not a duplicate error', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: fakeSetLogRow, error: null });
    from.mockReturnValueOnce(builder).mockReturnValueOnce(builder);

    const first = await logSet(client, 'user-1', {
      id: 'set-1',
      workoutSessionId: 'session-1',
      exerciseId: 'ex-1',
      setIndex: 1,
      weightKg: 50,
      reps: 10,
      rpe: null,
    });
    const retry = await logSet(client, 'user-1', {
      id: 'set-1',
      workoutSessionId: 'session-1',
      exerciseId: 'ex-1',
      setIndex: 1,
      weightKg: 50,
      reps: 10,
      rpe: null,
    });

    expect(first.error).toBeNull();
    expect(retry.error).toBeNull();
    expect(retry.data?.id).toBe(first.data?.id);
  });
});

describe('completeWorkoutSession (FR-5.5)', () => {
  test('sets both status and completed_at, scoped to the owning user', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: { ...fakeSessionRow, status: 'completed', completed_at: '2026-01-01T01:00:00Z' }, error: null });
    from.mockReturnValueOnce(builder);

    const result = await completeWorkoutSession(client, 'user-1', 'session-1');

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed' }),
    );
    const updatePayload = (builder.update as jest.Mock).mock.calls[0][0];
    expect(typeof updatePayload.completed_at).toBe('string');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result.data?.status).toBe('completed');
  });
});

describe('getSetLogsForSession', () => {
  test('returns set logs ordered by set_index, scoped to the session and user', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: [fakeSetLogRow], error: null });
    from.mockReturnValueOnce(builder);

    const result = await getSetLogsForSession(client, 'user-1', 'session-1');

    expect(builder.eq).toHaveBeenCalledWith('workout_session_id', 'session-1');
    expect(builder.order).toHaveBeenCalledWith('set_index');
    expect(result.data).toHaveLength(1);
  });
});

describe('getWorkoutSessionHistory (FR-5.5/AC-8)', () => {
  test('assembles sessions with their set logs and joined exercise names', async () => {
    const { client, from } = createMockClient();
    from
      .mockReturnValueOnce(createQueryBuilderMock({ data: [fakeSessionRow], error: null }))
      .mockReturnValueOnce(createQueryBuilderMock({ data: [fakeSetLogRow], error: null }))
      .mockReturnValueOnce(createQueryBuilderMock({ data: [{ id: 'ex-1', name: 'Squat' }], error: null }));

    const result = await getWorkoutSessionHistory(client, 'user-1');

    expect(result.data).toHaveLength(1);
    expect(result.data?.[0].exerciseNames['ex-1']).toBe('Squat');
    expect(result.data?.[0].setLogs).toHaveLength(1);
  });

  test('returns an empty array without further queries when the user has no sessions', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(createQueryBuilderMock({ data: [], error: null }));

    const result = await getWorkoutSessionHistory(client, 'user-1');

    expect(result.data).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });

  test('includes a freeform session (no planned_session_id/workout_plan_id) correctly', async () => {
    const freeformSession = { ...fakeSessionRow, planned_session_id: null, workout_plan_id: null };
    const { client, from } = createMockClient();
    from
      .mockReturnValueOnce(createQueryBuilderMock({ data: [freeformSession], error: null }))
      .mockReturnValueOnce(createQueryBuilderMock({ data: [fakeSetLogRow], error: null }))
      .mockReturnValueOnce(createQueryBuilderMock({ data: [{ id: 'ex-1', name: 'Squat' }], error: null }));

    const result = await getWorkoutSessionHistory(client, 'user-1');

    expect(result.data?.[0].session.plannedSessionId).toBeNull();
    expect(result.data?.[0].session.workoutPlanId).toBeNull();
  });
});
