import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import BodyProgressScreen from './BodyProgressScreen';

jest.mock('api-client', () => ({
  getWorkoutSessionsForDay: jest.fn(),
  getPlannedSessionById: jest.fn(),
  getCurrentPlan: jest.fn(),
  getProfile: jest.fn(),
  getMuscleKeysForExercises: jest.fn(),
  listMuscleGroups: jest.fn(),
  getWorkoutSessionHistory: jest.fn(),
  getScheduleAdjustments: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;
// Wednesday 11 Nov 2026, 15:00 local.
const now = () => new Date(2026, 10, 11, 15, 0, 0);

function session(id: string, plannedSessionId: string | null, exerciseSets: Record<string, number>) {
  return {
    session: {
      id,
      userId: 'user-1',
      plannedSessionId,
      workoutPlanId: plannedSessionId ? 'plan-1' : null,
      status: 'completed',
      startedAt: '2026-11-11T09:00:00.000Z',
      completedAt: '2026-11-11T10:00:00.000Z',
    },
    exerciseNames: {},
    setLogs: Object.entries(exerciseSets).flatMap(([exerciseId, n]) =>
      Array.from({ length: n }, (_, i) => ({
        id: `${id}-${exerciseId}-${i}`,
        workoutSessionId: id,
        exerciseId,
        setIndex: i + 1,
        weightKg: 50,
        reps: 10,
        rpe: null,
        loggedAt: '2026-11-11T09:10:00.000Z',
      })),
    ),
  } as never;
}

function prescribed(exerciseId: string, targetSets: number) {
  return {
    id: `pse-${exerciseId}`,
    exerciseId,
    exerciseName: exerciseId,
    orderIndex: 0,
    targetSets,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetWeightKg: null,
    intensityNote: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedApiClient.listMuscleGroups.mockResolvedValue({
    data: [
      { id: 'm1', key: 'chest', display_name: 'Chest' },
      { id: 'm2', key: 'triceps', display_name: 'Triceps' },
      { id: 'm3', key: 'biceps', display_name: 'Biceps' },
    ] as never,
    error: null,
  });
  mockedApiClient.getMuscleKeysForExercises.mockResolvedValue({
    data: new Map([
      ['bench', { primary: ['chest'], secondary: ['triceps'] }],
      ['pushdown', { primary: ['triceps'], secondary: [] }],
      ['curl', { primary: ['biceps'], secondary: [] }],
    ]),
    error: null,
  });
  mockedApiClient.getCurrentPlan.mockResolvedValue({ data: null, error: null });
  mockedApiClient.getProfile.mockResolvedValue({ data: null, error: null });
});

describe('BodyProgressScreen (FR-8.5/AC-20)', () => {
  test('AC-20: a partly done planned day shows per-muscle done/planned/left and the overall percent', async () => {
    mockedApiClient.getWorkoutSessionsForDay.mockResolvedValue({ data: [session('s1', 'push-day', { bench: 2 })], error: null });
    mockedApiClient.getPlannedSessionById.mockResolvedValue({
      data: { id: 'push-day', workoutPlanId: 'plan-1', dayOrder: 1, name: 'Push', exercises: [prescribed('bench', 4), prescribed('pushdown', 3)] },
      error: null,
    });

    const { getByTestId, getByText } = render(<BodyProgressScreen client={fakeClient} userId="user-1" now={now} />);

    // planned: chest 4, triceps 3 + 2 = 5 (total 9); done toward plan: chest 2 + triceps 1 = 3 -> 33%
    await waitFor(() => expect(getByTestId('body-progress-headline').props.children).toBe("33% of today's planned work done"));
    expect(getByTestId('body-progress-muscle-chest-detail').props.children).toBe('2 / 4 sets · 2 left');
    expect(getByTestId('body-progress-muscle-triceps-detail').props.children).toBe('1 / 5 sets · 4 left');
    expect(getByText('Plan: Push')).toBeTruthy();
    expect(getByTestId('mock-body-model').props.regionLabels).toEqual({ chest: 'Chest 50%', triceps: 'Triceps 20%' });

    const [, userId, startIso, endIso] = mockedApiClient.getWorkoutSessionsForDay.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(new Date(startIso).getTime()).toBe(new Date(2026, 10, 11).getTime());
    expect(new Date(endIso).getTime()).toBe(new Date(2026, 10, 12).getTime());
  });

  test('flags work outside the plan as "Also worked"', async () => {
    mockedApiClient.getWorkoutSessionsForDay.mockResolvedValue({
      data: [session('s1', 'push-day', { pushdown: 3 }), session('s2', null, { curl: 2 })],
      error: null,
    });
    mockedApiClient.getPlannedSessionById.mockResolvedValue({
      data: { id: 'push-day', workoutPlanId: 'plan-1', dayOrder: 1, name: 'Push', exercises: [prescribed('pushdown', 3)] },
      error: null,
    });

    const { getByTestId, getByText } = render(<BodyProgressScreen client={fakeClient} userId="user-1" now={now} />);

    await waitFor(() => expect(getByTestId('body-progress-headline').props.children).toBe("100% of today's planned work done"));
    expect(getByText('Every target done')).toBeTruthy();
    expect(getByTestId('body-progress-extras')).toBeTruthy();
    expect(getByTestId('body-progress-muscle-biceps-detail').props.children).toBe('2 sets');
    expect(getByTestId('mock-body-model').props.regionLabels).toEqual({ triceps: 'Triceps ✓', biceps: 'Biceps 2 sets' });
  });

  test('a rest day with no plan shows only what was done, with no percent', async () => {
    mockedApiClient.getWorkoutSessionsForDay.mockResolvedValue({ data: [session('s1', null, { curl: 3 })], error: null });

    const { getByTestId, queryByTestId } = render(<BodyProgressScreen client={fakeClient} userId="user-1" now={now} />);

    await waitFor(() => expect(getByTestId('body-progress-headline').props.children).toBe('Rest day. Here is what you did.'));
    expect(queryByTestId('body-progress-targeted')).toBeNull();
    expect(getByTestId('body-progress-muscle-biceps-detail').props.children).toBe('3 sets');
  });

  test('steps back to an earlier day and cannot go past today', async () => {
    mockedApiClient.getWorkoutSessionsForDay.mockResolvedValue({ data: [], error: null });

    const { getByTestId } = render(<BodyProgressScreen client={fakeClient} userId="user-1" now={now} />);
    await waitFor(() => expect(getByTestId('body-progress-headline').props.children).toBe('Rest day. Nothing planned today.'));
    expect(getByTestId('body-progress-date').props.children).toBe('Today');

    fireEvent.press(getByTestId('body-progress-next-day'));
    expect(getByTestId('body-progress-date').props.children).toBe('Today');

    fireEvent.press(getByTestId('body-progress-prev-day'));
    await waitFor(() => expect(getByTestId('body-progress-date').props.children).toBe('Yesterday'));
    await waitFor(() => expect(mockedApiClient.getWorkoutSessionsForDay).toHaveBeenCalledTimes(2));
    const [, , startIso] = mockedApiClient.getWorkoutSessionsForDay.mock.calls[1];
    expect(new Date(startIso).getTime()).toBe(new Date(2026, 10, 10).getTime());
  });

  test('shows an error when the day cannot be loaded', async () => {
    mockedApiClient.getWorkoutSessionsForDay.mockResolvedValue({ data: null, error: 'Network down' });

    const { getByTestId } = render(<BodyProgressScreen client={fakeClient} userId="user-1" now={now} />);

    await waitFor(() => expect(getByTestId('body-progress-error').props.children).toBe('Network down'));
  });
});
