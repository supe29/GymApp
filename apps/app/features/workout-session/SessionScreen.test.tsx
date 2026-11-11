import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import SessionScreen from './SessionScreen';

jest.mock('api-client', () => ({
  startWorkoutSession: jest.fn(),
  completeWorkoutSession: jest.fn(),
  getPlannedSessionById: jest.fn(),
  getUserEquipmentIds: jest.fn(),
  listEquipmentItems: jest.fn(),
  getExercisesWithTags: jest.fn(),
  getProfile: jest.fn(),
  getSetLogsForSession: jest.fn(),
  getSetLogsForExercises: jest.fn(),
  createProgressionSuggestion: jest.fn(),
  updateProgressionSuggestionStatus: jest.fn(),
  createPersonalRecord: jest.fn(),
  // FR-8.4 summary lookups: AI text falls back to the rule-based text by default.
  getSessionInsights: jest.fn(() => Promise.resolve({ data: null, error: 'fallback' })),
  listMuscleGroups: jest.fn(() => Promise.resolve({ data: [{ key: 'quadriceps', display_name: 'Quadriceps' }, { key: 'chest', display_name: 'Chest' }], error: null })),
  getCurrentPlan: jest.fn(() => Promise.resolve({ data: null, error: null })),
  getWorkoutSessionHistory: jest.fn(() => Promise.resolve({ data: [], error: null })),
}));

const mockEnqueue = jest.fn();
const mockRetryNow = jest.fn();
const mockDiscard = jest.fn();

jest.mock('./offlineQueue', () => {
  let idCounter = 0;
  return {
    generateLocalId: jest.fn(() => `generated-id-${++idCounter}`),
    createOfflineQueue: jest.fn(() => ({
      enqueue: mockEnqueue,
      retryNow: mockRetryNow,
      discard: mockDiscard,
      getAll: jest.fn().mockResolvedValue([]),
      teardown: jest.fn(),
    })),
  };
});

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

const plannedSession = {
  id: 'planned-1',
  workoutPlanId: 'plan-1',
  dayOrder: 1,
  name: 'Leg Day',
  exercises: [
    {
      id: 'pse-1',
      exerciseId: 'ex-1',
      exerciseName: 'Squat',
      orderIndex: 0,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetWeightKg: 50,
      intensityNote: null,
    },
    {
      id: 'pse-2',
      exerciseId: 'ex-2',
      exerciseName: 'Bench Press',
      orderIndex: 1,
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetWeightKg: null,
      intensityNote: null,
    },
  ],
};

const exerciseLibrary = [
  { id: 'ex-1', name: 'Squat', instructions: null, difficulty: 'beginner' as const, primaryMuscleKeys: ['quadriceps'], secondaryMuscleKeys: [], requiredEquipmentKeys: [] },
  { id: 'ex-2', name: 'Bench Press', instructions: null, difficulty: 'beginner' as const, primaryMuscleKeys: ['chest'], secondaryMuscleKeys: [], requiredEquipmentKeys: [] },
  { id: 'ex-3', name: 'Leg Press', instructions: null, difficulty: 'beginner' as const, primaryMuscleKeys: ['quadriceps'], secondaryMuscleKeys: [], requiredEquipmentKeys: [] },
];

async function renderLoaded(onSessionCompleted?: () => void) {
  mockedApiClient.startWorkoutSession.mockResolvedValue({
    data: { id: 'wsession-1', plannedSessionId: 'planned-1', workoutPlanId: 'plan-1', status: 'in_progress', startedAt: '', completedAt: null },
    error: null,
  });
  mockedApiClient.getPlannedSessionById.mockResolvedValue({ data: plannedSession, error: null });
  mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
  mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getExercisesWithTags.mockResolvedValue({ data: exerciseLibrary, error: null });
  mockedApiClient.getProfile.mockResolvedValue({ data: { unit_preference: 'metric' } as never, error: null });
  mockedApiClient.getSetLogsForExercises.mockResolvedValue({ data: [], error: null });
  mockedApiClient.createPersonalRecord.mockResolvedValue({ data: null, error: null });

  const utils = render(
    <SessionScreen client={fakeClient} userId="user-1" plannedSessionId="planned-1" onSessionCompleted={onSessionCompleted} />,
  );
  await waitFor(() => expect(utils.getByTestId('set-logger-ex-1')).toBeTruthy());
  return utils;
}

describe('SessionScreen (FR-5.2/FR-5.3/FR-5.4/NFR-3)', () => {
  afterEach(() => jest.clearAllMocks());

  test('starts a session and pre-fills slots from the planned session', async () => {
    const { getByTestId } = await renderLoaded();

    expect(mockedApiClient.startWorkoutSession).toHaveBeenCalledWith(fakeClient, 'user-1', 'planned-1');
    expect(getByTestId('set-logger-ex-1')).toBeTruthy();
    expect(getByTestId('set-logger-ex-2')).toBeTruthy();
  });

  test('FR-5.3: skipping an exercise hides its logger and shows a skipped marker', async () => {
    const { getByTestId, queryByTestId } = await renderLoaded();

    fireEvent.press(getByTestId('session-slot-pse-2-skip'));

    expect(queryByTestId('set-logger-ex-2')).toBeNull();
    expect(getByTestId('session-slot-pse-2-skipped')).toBeTruthy();
  });

  test('FR-5.3: adding an exercise not in the plan creates a new loggable slot', async () => {
    const { getByTestId } = await renderLoaded();

    fireEvent.press(getByTestId('session-add-exercise-toggle'));
    fireEvent.press(getByTestId('session-add-exercise-option-ex-3'));

    expect(getByTestId('set-logger-ex-3')).toBeTruthy();
  });

  test('integration: logs a full session including a mid-session substitution', async () => {
    mockEnqueue.mockResolvedValue(undefined);
    mockedApiClient.completeWorkoutSession.mockResolvedValue({
      data: { id: 'wsession-1', plannedSessionId: 'planned-1', workoutPlanId: 'plan-1', status: 'completed', startedAt: '', completedAt: '2026-01-01T01:00:00Z' },
      error: null,
    });
    const onSessionCompleted = jest.fn();

    const { getByTestId, queryByTestId } = render(
      <SessionScreen client={fakeClient} userId="user-1" plannedSessionId="planned-1" onSessionCompleted={onSessionCompleted} />,
    );
    mockedApiClient.startWorkoutSession.mockResolvedValue({
      data: { id: 'wsession-1', plannedSessionId: 'planned-1', workoutPlanId: 'plan-1', status: 'in_progress', startedAt: '', completedAt: null },
      error: null,
    });
    mockedApiClient.getPlannedSessionById.mockResolvedValue({ data: plannedSession, error: null });
    mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getExercisesWithTags.mockResolvedValue({ data: exerciseLibrary, error: null });
    mockedApiClient.getProfile.mockResolvedValue({ data: { unit_preference: 'metric' } as never, error: null });
    mockedApiClient.getSetLogsForExercises.mockResolvedValue({ data: [], error: null });
    mockedApiClient.createPersonalRecord.mockResolvedValue({ data: null, error: null });
    await waitFor(() => expect(queryByTestId('session-screen-loading')).toBeNull());

    // Log the first set for the prescribed Squat slot — steppers start
    // pre-filled from the prescription (50kg x 8), so +/- adjusts from there.
    fireEvent.press(getByTestId('set-logger-ex-1-weight-inc'));
    fireEvent.press(getByTestId('set-logger-ex-1-reps-inc'));
    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ workoutSessionId: 'wsession-1', exerciseId: 'ex-1', setIndex: 1, weightKg: 52.5, reps: 9 }),
    );

    // Mid-session substitution: replace Squat with Leg Press on the same slot.
    fireEvent.press(getByTestId('session-slot-pse-1-substitute-toggle'));
    fireEvent.press(getByTestId('session-slot-pse-1-substitute-option-ex-3'));

    expect(queryByTestId('set-logger-ex-1')).toBeNull();
    expect(getByTestId('set-logger-ex-3')).toBeTruthy();

    // Log a set against the substituted exercise — set index resets for the new exercise.
    fireEvent.press(getByTestId('set-logger-ex-3-log-button'));
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ workoutSessionId: 'wsession-1', exerciseId: 'ex-3', setIndex: 1 }),
    );

    // Log the Bench Press slot too, then complete the session.
    fireEvent.press(getByTestId('set-logger-ex-2-log-button'));

    // No confirmed logs on the server yet (nothing to evaluate) -> no
    // suggestions; FR-8.4: the summary still shows, and Done closes it.
    mockedApiClient.getSetLogsForSession.mockResolvedValue({ data: [], error: null });
    fireEvent.press(getByTestId('session-complete-button'));

    await waitFor(() => expect(getByTestId('session-suggestions-review')).toBeTruthy());
    expect(onSessionCompleted).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('session-suggestions-done'));
    expect(onSessionCompleted).toHaveBeenCalled();
    expect(mockedApiClient.completeWorkoutSession).toHaveBeenCalledWith(fakeClient, 'user-1', 'wsession-1');
  });

  test('Phase 8 integration: completion evaluates performance, shows a suggestion per exercise, and accepting one persists it before onSessionCompleted fires', async () => {
    mockedApiClient.completeWorkoutSession.mockResolvedValue({
      data: { id: 'wsession-1', plannedSessionId: 'planned-1', workoutPlanId: 'plan-1', status: 'completed', startedAt: '', completedAt: '2026-01-01T01:00:00Z' },
      error: null,
    });
    // Squat (ex-1): full success at the ceiling on all 3 sets -> increase_weight.
    // Bench Press (ex-2): missed the floor on set 2 -> hold (AC-7/SR-4).
    mockedApiClient.getSetLogsForSession.mockResolvedValue({
      data: [
        { id: 'l1', workoutSessionId: 'wsession-1', exerciseId: 'ex-1', setIndex: 1, weightKg: 50, reps: 12, rpe: null, loggedAt: '' },
        { id: 'l2', workoutSessionId: 'wsession-1', exerciseId: 'ex-1', setIndex: 2, weightKg: 50, reps: 12, rpe: null, loggedAt: '' },
        { id: 'l3', workoutSessionId: 'wsession-1', exerciseId: 'ex-1', setIndex: 3, weightKg: 50, reps: 12, rpe: null, loggedAt: '' },
        { id: 'l4', workoutSessionId: 'wsession-1', exerciseId: 'ex-2', setIndex: 1, weightKg: 30, reps: 12, rpe: null, loggedAt: '' },
        { id: 'l5', workoutSessionId: 'wsession-1', exerciseId: 'ex-2', setIndex: 2, weightKg: 30, reps: 5, rpe: null, loggedAt: '' },
        { id: 'l6', workoutSessionId: 'wsession-1', exerciseId: 'ex-2', setIndex: 3, weightKg: 30, reps: 12, rpe: null, loggedAt: '' },
      ],
      error: null,
    });
    mockedApiClient.createProgressionSuggestion.mockImplementation(async (_client, _userId, input) => ({
      data: {
        id: `sugg-${input.exerciseId}`,
        exerciseId: input.exerciseId,
        sourceWorkoutSessionId: input.sourceWorkoutSessionId,
        action: input.action,
        suggestedWeightKg: input.suggestedWeightKg,
        suggestedReps: input.suggestedReps,
        rationale: input.rationale,
        status: 'pending',
        overriddenWeightKg: null,
        overriddenReps: null,
      },
      error: null,
    }));
    mockedApiClient.updateProgressionSuggestionStatus.mockResolvedValue({
      data: {
        id: 'sugg-ex-1',
        exerciseId: 'ex-1',
        sourceWorkoutSessionId: 'wsession-1',
        action: 'increase_weight',
        suggestedWeightKg: 52.5,
        suggestedReps: 8,
        rationale: 'rationale',
        status: 'accepted',
        overriddenWeightKg: null,
        overriddenReps: null,
      },
      error: null,
    });
    const onSessionCompleted = jest.fn();
    const { getByTestId } = await renderLoaded(onSessionCompleted);

    fireEvent.press(getByTestId('session-complete-button'));
    // Nothing was logged locally, so completion asks for confirmation first.
    fireEvent.press(getByTestId('session-complete-confirm'));

    await waitFor(() => expect(getByTestId('progression-card-ex-1')).toBeTruthy());
    const ex1Action = getByTestId('progression-card-ex-1-action').props.children.join('');
    expect(ex1Action).toContain('Increase weight');
    const ex2Action = getByTestId('progression-card-ex-2-action').props.children.join('');
    // AC-7/SR-4: a missed set must never produce an increase suggestion.
    expect(ex2Action).toContain('Hold');
    expect(mockedApiClient.createProgressionSuggestion).toHaveBeenCalledWith(
      fakeClient,
      'user-1',
      expect.objectContaining({ exerciseId: 'ex-2', action: 'hold' }),
    );

    fireEvent.press(getByTestId('progression-card-ex-1-accept'));
    await waitFor(() =>
      expect(mockedApiClient.updateProgressionSuggestionStatus).toHaveBeenCalledWith(
        fakeClient,
        'user-1',
        'sugg-ex-1',
        { status: 'accepted' },
      ),
    );

    // AC-6: the suggestion exists and is visible before the exercise's
    // next occurrence — not yet dismissed via "Done".
    expect(onSessionCompleted).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('session-suggestions-done'));
    await waitFor(() => expect(onSessionCompleted).toHaveBeenCalled());
  });

  test('Phase 10 integration (FR-8.2/AC-11/NFR-4): a new heaviest set shows a PR card before onSessionCompleted fires', async () => {
    const onSessionCompleted = jest.fn();
    const { getByTestId } = await renderLoaded(onSessionCompleted);

    // Set up test-specific mocks AFTER renderLoaded, since renderLoaded
    // itself sets safe defaults for getSetLogsForExercises/createPersonalRecord
    // that would otherwise clobber these.
    mockedApiClient.completeWorkoutSession.mockResolvedValue({
      data: { id: 'wsession-1', plannedSessionId: 'planned-1', workoutPlanId: 'plan-1', status: 'completed', startedAt: '', completedAt: '2026-01-01T01:00:00Z' },
      error: null,
    });
    // Squat (ex-1): a missed set so no progression suggestion is generated,
    // isolating this test to PR derivation. One set at 55kg x 8 reps — a
    // new heaviest 8-rep set compared to the 50kg prior best below.
    mockedApiClient.getSetLogsForSession.mockResolvedValue({
      data: [
        { id: 'l1', workoutSessionId: 'wsession-1', exerciseId: 'ex-1', setIndex: 1, weightKg: 55, reps: 8, rpe: null, loggedAt: '2026-01-01T01:00:00Z' },
        { id: 'l2', workoutSessionId: 'wsession-1', exerciseId: 'ex-1', setIndex: 2, weightKg: null, reps: null, rpe: null, loggedAt: '2026-01-01T01:00:00Z' },
        { id: 'l4', workoutSessionId: 'wsession-1', exerciseId: 'ex-2', setIndex: 1, weightKg: 30, reps: 12, rpe: null, loggedAt: '' },
        { id: 'l5', workoutSessionId: 'wsession-1', exerciseId: 'ex-2', setIndex: 2, weightKg: 30, reps: 12, rpe: null, loggedAt: '' },
        { id: 'l6', workoutSessionId: 'wsession-1', exerciseId: 'ex-2', setIndex: 3, weightKg: 30, reps: 12, rpe: null, loggedAt: '' },
      ],
      error: null,
    });
    mockedApiClient.getSetLogsForExercises.mockResolvedValue({
      data: [
        { id: 'prior-1', workoutSessionId: 'wsession-0', exerciseId: 'ex-1', setIndex: 1, weightKg: 50, reps: 8, rpe: null, loggedAt: '2025-12-01T00:00:00Z' },
      ],
      error: null,
    });
    mockedApiClient.createProgressionSuggestion.mockResolvedValue({ data: null, error: null });
    mockedApiClient.createPersonalRecord.mockImplementation(async (_client, _userId, input) => ({
      data: {
        id: 'pr-1',
        exerciseId: input.exerciseId,
        setLogId: input.setLogId,
        repCount: input.repCount,
        weightKg: input.weightKg,
        estimatedOneRm: input.estimatedOneRm,
        achievedAt: input.achievedAt,
      },
      error: null,
    }));

    fireEvent.press(getByTestId('session-complete-button'));
    // Nothing was logged locally, so completion asks for confirmation first.
    fireEvent.press(getByTestId('session-complete-confirm'));

    await waitFor(() => expect(getByTestId('new-pr-card-Squat-8')).toBeTruthy());
    expect(mockedApiClient.createPersonalRecord).toHaveBeenCalledWith(
      fakeClient,
      'user-1',
      expect.objectContaining({ exerciseId: 'ex-1', repCount: 8, weightKg: 55 }),
    );
    expect(onSessionCompleted).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('session-suggestions-done'));
    await waitFor(() => expect(onSessionCompleted).toHaveBeenCalled());
  });

  test('completing with untouched exercises warns first, and "Keep training" cancels', async () => {
    const onSessionCompleted = jest.fn();
    const { getByTestId, queryByTestId } = await renderLoaded(onSessionCompleted);

    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));
    fireEvent.press(getByTestId('session-complete-button'));

    expect(getByTestId('session-complete-warning')).toBeTruthy();
    expect(mockedApiClient.completeWorkoutSession).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('session-complete-keep-training'));
    expect(queryByTestId('session-complete-warning')).toBeNull();
    expect(mockedApiClient.completeWorkoutSession).not.toHaveBeenCalled();
  });

  test('shows each prescribed exercise target (sets x reps)', async () => {
    const { getByTestId } = await renderLoaded(jest.fn());
    expect(getByTestId('set-logger-ex-1-target').props.children.join('')).toBe(
      'Target: 3 × 8–12 reps @ 50 kg · 0/3 sets done',
    );
  });

  test('pre-fills weight from the most recent earlier set when the plan has no target weight', async () => {
    // Once-value takes precedence over renderLoaded's default empty history.
    mockedApiClient.getSetLogsForExercises.mockResolvedValueOnce({
      data: [
        { id: 'old-1', workoutSessionId: 'wsession-0', exerciseId: 'ex-2', setIndex: 1, weightKg: 40, reps: 10, rpe: null, loggedAt: '2026-01-01T10:00:00Z' },
        { id: 'old-2', workoutSessionId: 'wsession-0', exerciseId: 'ex-2', setIndex: 2, weightKg: 42.5, reps: 9, rpe: null, loggedAt: '2026-01-01T10:05:00Z' },
      ],
      error: null,
    });
    const { getByTestId } = await renderLoaded();
    expect(getByTestId('set-logger-ex-2-previous').props.children.join('')).toBe('Last time: 42.5 kg × 9');
    expect(getByTestId('set-logger-ex-2-weight-value').props.value).toBe('42.5');
    // ex-1 has a prescribed target weight, which wins over history.
    expect(getByTestId('set-logger-ex-1-weight-value').props.value).toBe('50');
  });

  test('shows every exercise movement demo by default, with its muscles lit; each can be hidden', async () => {
    const { getByTestId, queryByTestId, getAllByTestId } = await renderLoaded();

    expect(getAllByTestId('mock-demo-figure')).toHaveLength(2);
    expect(getByTestId('session-slot-pse-1-demo')).toBeTruthy();
    expect(getByTestId('session-slot-pse-2-demo')).toBeTruthy();
    expect(getAllByTestId('mock-demo-figure').map((f) => f.props.muscles)).toEqual([
      { primary: ['quadriceps'], secondary: [] },
      { primary: ['chest'], secondary: [] },
    ]);

    fireEvent.press(getByTestId('session-slot-pse-1-demo-toggle'));
    expect(queryByTestId('session-slot-pse-1-demo')).toBeNull();
    expect(getByTestId('session-slot-pse-2-demo')).toBeTruthy();

    fireEvent.press(getByTestId('session-slot-pse-1-demo-toggle'));
    expect(getByTestId('session-slot-pse-1-demo')).toBeTruthy();

    fireEvent.press(getByTestId('session-slot-pse-2-skip'));
    expect(queryByTestId('session-slot-pse-2-demo')).toBeNull();
    expect(queryByTestId('session-slot-pse-2-demo-toggle')).toBeNull();
  });

  test('FR-8.4: completion shows a summary of the work, muscles, goal fit and the next planned session', async () => {
    mockedApiClient.completeWorkoutSession.mockResolvedValue({
      data: { id: 'wsession-1', plannedSessionId: 'planned-1', workoutPlanId: 'plan-1', status: 'completed', startedAt: '', completedAt: '' },
      error: null,
    });
    mockedApiClient.getSetLogsForSession.mockResolvedValue({
      data: [
        { id: 'l1', workoutSessionId: 'wsession-1', exerciseId: 'ex-1', setIndex: 1, weightKg: 50, reps: 10, rpe: null, loggedAt: '' },
        { id: 'l2', workoutSessionId: 'wsession-1', exerciseId: 'ex-1', setIndex: 2, weightKg: 50, reps: 9, rpe: null, loggedAt: '' },
      ],
      error: null,
    });
    mockedApiClient.createProgressionSuggestion.mockResolvedValue({ data: null, error: 'skip' });
    mockedApiClient.getCurrentPlan.mockResolvedValue({
      data: {
        id: 'plan-1',
        splitType: 'full_body',
        planVersion: 1,
        effectiveFrom: '',
        sessions: [
          { id: 'planned-1', dayOrder: 1, name: 'Leg Day', exercises: [] },
          { id: 'planned-2', dayOrder: 2, name: 'Push Day', exercises: [] },
        ],
      },
      error: null,
    });

    const { getByTestId, queryByTestId } = await renderLoaded();
    fireEvent.press(getByTestId('session-slot-pse-2-skip'));
    fireEvent.press(getByTestId('session-complete-button'));
    fireEvent.press(getByTestId('session-complete-confirm'));

    await waitFor(() => expect(getByTestId('session-suggestions-review')).toBeTruthy());
    expect(getByTestId('session-summary-exercise-ex-1')).toBeTruthy();
    expect(queryByTestId('session-summary-exercise-ex-2')).toBeNull();
    expect(getByTestId('session-summary-muscle-quadriceps')).toBeTruthy();
    expect(getByTestId('session-summary-next-text').props.children).toContain('Next up: Push Day.');
    await waitFor(() => expect(mockedApiClient.getSessionInsights).toHaveBeenCalled());
    expect(mockedApiClient.getSessionInsights.mock.calls[0][1]).toMatchObject({ session: 'Leg Day', totals: { sets: 2, reps: 19 } });
  });

  test('FR-2.6: a merged missed session adds its exercises after today’s, without duplicates', async () => {
    mockedApiClient.startWorkoutSession.mockResolvedValue({
      data: { id: 'wsession-1', plannedSessionId: 'planned-1', workoutPlanId: 'plan-1', status: 'in_progress', startedAt: '', completedAt: null },
      error: null,
    });
    mockedApiClient.getPlannedSessionById.mockImplementation(async (_client, _user, id) =>
      id === 'planned-1'
        ? { data: plannedSession, error: null }
        : {
            data: {
              ...plannedSession,
              id: 'planned-0',
              name: 'Missed Day',
              exercises: [
                { ...plannedSession.exercises[0], id: 'pse-0a' }, // Squat again: de-duplicated
                { ...plannedSession.exercises[0], id: 'pse-0b', exerciseId: 'ex-3', exerciseName: 'Leg Press' },
              ],
            },
            error: null,
          },
    );
    mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getExercisesWithTags.mockResolvedValue({ data: exerciseLibrary, error: null });
    mockedApiClient.getProfile.mockResolvedValue({ data: { unit_preference: 'metric' } as never, error: null });
    mockedApiClient.getSetLogsForExercises.mockResolvedValue({ data: [], error: null });

    const { getByTestId, queryByTestId } = render(
      <SessionScreen client={fakeClient} userId="user-1" plannedSessionId="planned-1" mergedPlannedSessionId="planned-0" />,
    );

    await waitFor(() => expect(getByTestId('set-logger-ex-3')).toBeTruthy());
    expect(getByTestId('set-logger-ex-1')).toBeTruthy();
    expect(getByTestId('set-logger-ex-2')).toBeTruthy();
    expect(queryByTestId('session-slot-pse-0a-skip')).toBeNull();
    expect(getByTestId('session-slot-pse-0b-skip')).toBeTruthy();
    expect(mockedApiClient.startWorkoutSession).toHaveBeenCalledWith(fakeClient, 'user-1', 'planned-1');
  });
});
