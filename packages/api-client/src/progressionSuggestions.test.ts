import {
  createProgressionSuggestion,
  getLatestEffectiveSuggestionsForExercises,
  getPendingProgressionSuggestions,
  updateProgressionSuggestionStatus,
  type ProgressionSuggestionRow,
} from './progressionSuggestions';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

const fakeSuggestionRow: ProgressionSuggestionRow = {
  id: 'sugg-1',
  user_id: 'user-1',
  exercise_id: 'ex-1',
  source_workout_session_id: 'session-1',
  action: 'increase_weight',
  suggested_weight_kg: 52.5,
  suggested_reps: 8,
  rationale: 'You hit 12+ reps on every set.',
  status: 'pending',
  overridden_weight_kg: null,
  overridden_reps: null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('createProgressionSuggestion (FR-6.1)', () => {
  test('inserts with status omitted (DB defaults to pending) and overridden_* explicitly null', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: fakeSuggestionRow, error: null });
    from.mockReturnValueOnce(builder);

    const result = await createProgressionSuggestion(client, 'user-1', {
      exerciseId: 'ex-1',
      sourceWorkoutSessionId: 'session-1',
      action: 'increase_weight',
      suggestedWeightKg: 52.5,
      suggestedReps: 8,
      rationale: 'You hit 12+ reps on every set.',
    });

    expect(from).toHaveBeenCalledWith('progression_suggestions');
    const insertedPayload = (builder.insert as jest.Mock).mock.calls[0][0];
    expect(insertedPayload).not.toHaveProperty('status');
    expect(insertedPayload.overridden_weight_kg).toBeNull();
    expect(result.data?.action).toBe('increase_weight');
  });
});

describe('updateProgressionSuggestionStatus (FR-6.2)', () => {
  test('accept: updates only status, scoped to the owning user', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: { ...fakeSuggestionRow, status: 'accepted' }, error: null });
    from.mockReturnValueOnce(builder);

    const result = await updateProgressionSuggestionStatus(client, 'user-1', 'sugg-1', { status: 'accepted' });

    expect(builder.update).toHaveBeenCalledWith({ status: 'accepted' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'sugg-1');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result.data?.status).toBe('accepted');
  });

  test('decline: updates only status', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: { ...fakeSuggestionRow, status: 'declined' }, error: null });
    from.mockReturnValueOnce(builder);

    await updateProgressionSuggestionStatus(client, 'user-1', 'sugg-1', { status: 'declined' });

    expect(builder.update).toHaveBeenCalledWith({ status: 'declined' });
  });

  test('override: updates status plus overridden_weight_kg/overridden_reps', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({
      data: { ...fakeSuggestionRow, status: 'overridden', overridden_weight_kg: 55, overridden_reps: 6 },
      error: null,
    });
    from.mockReturnValueOnce(builder);

    const result = await updateProgressionSuggestionStatus(client, 'user-1', 'sugg-1', {
      status: 'overridden',
      overriddenWeightKg: 55,
      overriddenReps: 6,
    });

    expect(builder.update).toHaveBeenCalledWith({
      status: 'overridden',
      overridden_weight_kg: 55,
      overridden_reps: 6,
    });
    expect(result.data?.overriddenWeightKg).toBe(55);
  });
});

describe('getLatestEffectiveSuggestionsForExercises (FR-6.1)', () => {
  test('returns an empty map without querying when given no exercise ids', async () => {
    const { client, from } = createMockClient();

    const result = await getLatestEffectiveSuggestionsForExercises(client, 'user-1', []);

    expect(from).not.toHaveBeenCalled();
    expect(result.data).toEqual(new Map());
  });

  test('filters to accepted/overridden status, ordered newest first', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: [], error: null });
    from.mockReturnValueOnce(builder);

    await getLatestEffectiveSuggestionsForExercises(client, 'user-1', ['ex-1']);

    expect(builder.in).toHaveBeenCalledWith('exercise_id', ['ex-1']);
    expect(builder.in).toHaveBeenCalledWith('status', ['accepted', 'overridden']);
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  test('keeps only the most recent row per exercise when multiple exist', async () => {
    const { client, from } = createMockClient();
    const newer = { ...fakeSuggestionRow, exercise_id: 'ex-1', status: 'accepted' as const, suggested_weight_kg: 55, created_at: '2026-02-01T00:00:00Z' };
    const older = { ...fakeSuggestionRow, exercise_id: 'ex-1', status: 'accepted' as const, suggested_weight_kg: 52.5, created_at: '2026-01-01T00:00:00Z' };
    // Rows are expected newest-first per the .order() call, matching real Postgrest ordering.
    const builder = createQueryBuilderMock({ data: [newer, older], error: null });
    from.mockReturnValueOnce(builder);

    const result = await getLatestEffectiveSuggestionsForExercises(client, 'user-1', ['ex-1']);

    expect(result.data?.get('ex-1')).toEqual({ weightKg: 55, repsMin: 8 });
  });

  test('uses overridden values for a row whose status is overridden', async () => {
    const { client, from } = createMockClient();
    const overridden = { ...fakeSuggestionRow, status: 'overridden' as const, overridden_weight_kg: 60, overridden_reps: 5 };
    const builder = createQueryBuilderMock({ data: [overridden], error: null });
    from.mockReturnValueOnce(builder);

    const result = await getLatestEffectiveSuggestionsForExercises(client, 'user-1', ['ex-1']);

    expect(result.data?.get('ex-1')).toEqual({ weightKg: 60, repsMin: 5 });
  });
});

describe('getPendingProgressionSuggestions (FR-6.2/UX-6)', () => {
  test('keeps only the newest suggestion per exercise, and only when it is still pending', async () => {
    const { client, from } = createMockClient();
    const suggestionsBuilder = createQueryBuilderMock({
      data: [
        { ...fakeSuggestionRow, id: 'new-ex1', exercise_id: 'ex-1', status: 'pending', created_at: '2026-01-03T00:00:00Z' },
        { ...fakeSuggestionRow, id: 'new-ex2', exercise_id: 'ex-2', status: 'accepted', created_at: '2026-01-02T00:00:00Z' },
        { ...fakeSuggestionRow, id: 'old-ex2', exercise_id: 'ex-2', status: 'pending', created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    });
    const namesBuilder = createQueryBuilderMock({ data: [{ id: 'ex-1', name: 'Squat' }], error: null });
    from.mockReturnValueOnce(suggestionsBuilder).mockReturnValueOnce(namesBuilder);

    const result = await getPendingProgressionSuggestions(client, 'user-1');

    expect(suggestionsBuilder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(namesBuilder.in).toHaveBeenCalledWith('id', ['ex-1']);
    expect(result.data?.map((s) => s.id)).toEqual(['new-ex1']);
    expect(result.data?.[0].exerciseName).toBe('Squat');
  });

  test('returns an empty list without a name lookup when nothing is pending', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(
      createQueryBuilderMock({ data: [{ ...fakeSuggestionRow, status: 'declined' }], error: null }),
    );

    const result = await getPendingProgressionSuggestions(client, 'user-1');

    expect(result).toEqual({ data: [], error: null });
    expect(from).toHaveBeenCalledTimes(1);
  });

  test('passes through a query error', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(createQueryBuilderMock({ data: null, error: { message: 'boom' } }));

    expect(await getPendingProgressionSuggestions(client, 'user-1')).toEqual({ data: null, error: 'boom' });
  });
});
