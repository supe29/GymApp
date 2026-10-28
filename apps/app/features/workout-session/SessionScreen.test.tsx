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
      targetWeightKg: null,
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

async function renderLoaded() {
  mockedApiClient.startWorkoutSession.mockResolvedValue({
    data: { id: 'wsession-1', plannedSessionId: 'planned-1', workoutPlanId: 'plan-1', status: 'in_progress', startedAt: '', completedAt: null },
    error: null,
  });
  mockedApiClient.getPlannedSessionById.mockResolvedValue({ data: plannedSession, error: null });
  mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
  mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getExercisesWithTags.mockResolvedValue({ data: exerciseLibrary, error: null });

  const utils = render(<SessionScreen client={fakeClient} userId="user-1" plannedSessionId="planned-1" />);
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
    await waitFor(() => expect(queryByTestId('session-screen-loading')).toBeNull());

    // Log the first set for the prescribed Squat slot.
    fireEvent.press(getByTestId('set-logger-ex-1-weight-inc'));
    fireEvent.press(getByTestId('set-logger-ex-1-reps-inc'));
    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));

    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ workoutSessionId: 'wsession-1', exerciseId: 'ex-1', setIndex: 1, weightKg: 2.5, reps: 1 }),
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
    fireEvent.press(getByTestId('session-complete-button'));

    await waitFor(() => expect(onSessionCompleted).toHaveBeenCalled());
    expect(mockedApiClient.completeWorkoutSession).toHaveBeenCalledWith(fakeClient, 'user-1', 'wsession-1');
  });
});
