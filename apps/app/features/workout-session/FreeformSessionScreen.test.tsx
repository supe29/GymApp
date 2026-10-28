import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import FreeformSessionScreen from './FreeformSessionScreen';

jest.mock('api-client', () => ({
  startWorkoutSession: jest.fn(),
  completeWorkoutSession: jest.fn(),
  getUserEquipmentIds: jest.fn(),
  listEquipmentItems: jest.fn(),
  getExercisesWithTags: jest.fn(),
}));

const mockEnqueue = jest.fn();

jest.mock('./offlineQueue', () => {
  let idCounter = 0;
  return {
    generateLocalId: jest.fn(() => `generated-id-${++idCounter}`),
    createOfflineQueue: jest.fn(() => ({
      enqueue: mockEnqueue,
      retryNow: jest.fn(),
      discard: jest.fn(),
      getAll: jest.fn().mockResolvedValue([]),
      teardown: jest.fn(),
    })),
  };
});

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

const exerciseLibrary = [
  { id: 'ex-1', name: 'Bodyweight Squat', instructions: null, difficulty: 'beginner' as const, primaryMuscleKeys: ['quadriceps'], secondaryMuscleKeys: [], requiredEquipmentKeys: [] },
  { id: 'ex-2', name: 'Push-Up', instructions: null, difficulty: 'beginner' as const, primaryMuscleKeys: ['chest'], secondaryMuscleKeys: [], requiredEquipmentKeys: [] },
];

async function renderLoaded(onSessionCompleted?: () => void) {
  mockedApiClient.startWorkoutSession.mockResolvedValue({
    data: { id: 'wsession-1', plannedSessionId: null, workoutPlanId: null, status: 'in_progress', startedAt: '', completedAt: null },
    error: null,
  });
  mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
  mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getExercisesWithTags.mockResolvedValue({ data: exerciseLibrary, error: null });

  const utils = render(
    <FreeformSessionScreen client={fakeClient} userId="user-1" onSessionCompleted={onSessionCompleted} />,
  );
  await waitFor(() => expect(utils.queryByTestId('freeform-session-empty')).toBeTruthy());
  return utils;
}

describe('FreeformSessionScreen (FR-5.2/AC-8)', () => {
  afterEach(() => jest.clearAllMocks());

  test('FR-5.2: starts a session with no plan attachment', async () => {
    await renderLoaded();
    expect(mockedApiClient.startWorkoutSession).toHaveBeenCalledWith(fakeClient, 'user-1');
  });

  test('shows an empty state until an exercise is added', async () => {
    const { getByTestId } = await renderLoaded();
    expect(getByTestId('freeform-session-empty')).toBeTruthy();
  });

  test('integration (AC-8): creates and completes a freeform session with added exercises logged correctly', async () => {
    mockEnqueue.mockResolvedValue(undefined);
    mockedApiClient.completeWorkoutSession.mockResolvedValue({
      data: { id: 'wsession-1', plannedSessionId: null, workoutPlanId: null, status: 'completed', startedAt: '', completedAt: '2026-01-01T01:00:00Z' },
      error: null,
    });
    const onSessionCompleted = jest.fn();
    const { getByTestId, queryByTestId } = await renderLoaded(onSessionCompleted);

    // Add two exercises not from any plan.
    fireEvent.press(getByTestId('freeform-add-exercise-toggle'));
    fireEvent.press(getByTestId('freeform-add-exercise-option-ex-1'));
    expect(getByTestId('set-logger-ex-1')).toBeTruthy();
    expect(queryByTestId('freeform-session-empty')).toBeNull();

    fireEvent.press(getByTestId('freeform-add-exercise-toggle'));
    fireEvent.press(getByTestId('freeform-add-exercise-option-ex-2'));
    expect(getByTestId('set-logger-ex-2')).toBeTruthy();

    // Log sets against each, correctly attributed by exercise and set index.
    fireEvent.press(getByTestId('set-logger-ex-1-reps-inc'));
    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ workoutSessionId: 'wsession-1', exerciseId: 'ex-1', setIndex: 1 }),
    );

    fireEvent.press(getByTestId('set-logger-ex-2-reps-inc'));
    fireEvent.press(getByTestId('set-logger-ex-2-log-button'));
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ workoutSessionId: 'wsession-1', exerciseId: 'ex-2', setIndex: 1 }),
    );

    fireEvent.press(getByTestId('freeform-complete-button'));

    await waitFor(() => expect(onSessionCompleted).toHaveBeenCalled());
    expect(mockedApiClient.completeWorkoutSession).toHaveBeenCalledWith(fakeClient, 'user-1', 'wsession-1');
  });

  test('an already-added exercise no longer appears in the add-exercise list', async () => {
    const { getByTestId, queryByTestId } = await renderLoaded();

    fireEvent.press(getByTestId('freeform-add-exercise-toggle'));
    fireEvent.press(getByTestId('freeform-add-exercise-option-ex-1'));

    fireEvent.press(getByTestId('freeform-add-exercise-toggle'));
    expect(queryByTestId('freeform-add-exercise-option-ex-1')).toBeNull();
    expect(getByTestId('freeform-add-exercise-option-ex-2')).toBeTruthy();
  });
});
