import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import WorkoutHistoryScreen from './WorkoutHistoryScreen';

jest.mock('api-client', () => ({
  getWorkoutSessionHistory: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

describe('WorkoutHistoryScreen (FR-5.5/AC-8)', () => {
  afterEach(() => jest.clearAllMocks());

  test('shows an empty state when the user has no sessions yet', async () => {
    mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({ data: [], error: null });

    const { getByTestId } = render(<WorkoutHistoryScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('history-empty')).toBeTruthy());
  });

  test('UX-9: the empty state offers a working "start a workout" action when onStartWorkout is given', async () => {
    mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({ data: [], error: null });
    const onStartWorkout = jest.fn();

    const { getByTestId } = render(
      <WorkoutHistoryScreen client={fakeClient} userId="user-1" onStartWorkout={onStartWorkout} />,
    );

    await waitFor(() => expect(getByTestId('history-empty-action')).toBeTruthy());
    fireEvent.press(getByTestId('history-empty-action'));
    expect(onStartWorkout).toHaveBeenCalled();
  });

  test('renders a plan-attached session with its per-exercise set counts', async () => {
    mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({
      data: [
        {
          session: {
            id: 'session-1',
            plannedSessionId: 'planned-1',
            workoutPlanId: 'plan-1',
            status: 'completed',
            startedAt: '2026-01-05T10:00:00Z',
            completedAt: '2026-01-05T11:00:00Z',
          },
          exerciseNames: { 'ex-1': 'Squat' },
          setLogs: [
            { id: 's1', workoutSessionId: 'session-1', exerciseId: 'ex-1', setIndex: 1, weightKg: 50, reps: 10, rpe: null, loggedAt: '' },
            { id: 's2', workoutSessionId: 'session-1', exerciseId: 'ex-1', setIndex: 2, weightKg: 50, reps: 8, rpe: null, loggedAt: '' },
          ],
        },
      ],
      error: null,
    });

    const { getByTestId } = render(<WorkoutHistoryScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('history-session-session-1')).toBeTruthy());
    expect(getByTestId('history-session-session-1-type').props.children).toBe('Plan-attached');
    expect(getByTestId('history-session-session-1-exercise-ex-1').props.children.join('')).toContain('2 sets');
  });

  test('AC-8: renders a freeform session correctly, distinct from plan-attached', async () => {
    mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({
      data: [
        {
          session: {
            id: 'session-2',
            plannedSessionId: null,
            workoutPlanId: null,
            status: 'completed',
            startedAt: '2026-01-06T10:00:00Z',
            completedAt: '2026-01-06T10:30:00Z',
          },
          exerciseNames: { 'ex-9': 'Push-Up' },
          setLogs: [
            { id: 's1', workoutSessionId: 'session-2', exerciseId: 'ex-9', setIndex: 1, weightKg: null, reps: 15, rpe: null, loggedAt: '' },
          ],
        },
      ],
      error: null,
    });

    const { getByTestId } = render(<WorkoutHistoryScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('history-session-session-2')).toBeTruthy());
    expect(getByTestId('history-session-session-2-type').props.children).toBe('Freeform');
    expect(getByTestId('history-session-session-2-exercise-ex-9').props.children.join('')).toContain('1 set');
  });

  test('hides an abandoned session that was opened but never logged or completed', async () => {
    mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({
      data: [
        {
          session: {
            id: 'abandoned-1',
            plannedSessionId: 'planned-1',
            workoutPlanId: 'plan-1',
            status: 'in_progress',
            startedAt: '2026-01-06T10:00:00Z',
            completedAt: null,
          },
          exerciseNames: {},
          setLogs: [],
        },
      ],
      error: null,
    });

    const { getByTestId, queryByTestId } = render(<WorkoutHistoryScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('history-empty')).toBeTruthy());
    expect(queryByTestId('history-session-abandoned-1')).toBeNull();
  });

  test('shows an error message when the fetch fails', async () => {
    mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({ data: null, error: 'network error' });

    const { getByTestId } = render(<WorkoutHistoryScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('history-error').props.children).toBe('network error'));
  });
});
