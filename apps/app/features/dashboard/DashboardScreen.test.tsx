import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import DashboardScreen from './DashboardScreen';

jest.mock('api-client', () => ({
  getCurrentPlan: jest.fn(),
  getWorkoutSessionHistory: jest.fn(),
  getCurrentNutritionTargets: jest.fn(),
  getFoodLogEntriesForDate: jest.fn(),
  getPersonalRecordsForUser: jest.fn(),
  getProfile: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

const PLAN = {
  id: 'plan-1',
  splitType: 'full_body' as const,
  planVersion: 1,
  effectiveFrom: '',
  sessions: [
    { id: 's1', dayOrder: 1, name: 'Full Body A', exercises: [] },
    { id: 's2', dayOrder: 2, name: 'Full Body B', exercises: [] },
  ],
};

const TARGETS = {
  id: 'target-1',
  dailyCalories: 2000,
  proteinG: 150,
  carbsG: 200,
  fatG: 60,
  targetVersion: 1,
  effectiveFrom: '',
};

function defaultMocks() {
  mockedApiClient.getCurrentPlan.mockResolvedValue({ data: PLAN, error: null });
  mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: TARGETS, error: null });
  mockedApiClient.getFoodLogEntriesForDate.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getPersonalRecordsForUser.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getProfile.mockResolvedValue({ data: { unit_preference: 'metric' } as never, error: null });
}

describe('DashboardScreen (UX-3/UX-6)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('UX-3: shows the next planned session with a working start-session button', async () => {
    defaultMocks();
    const onStartSession = jest.fn();

    const { getByTestId } = render(
      <DashboardScreen client={fakeClient} userId="user-1" onStartSession={onStartSession} />,
    );

    await waitFor(() => expect(getByTestId('dashboard-next-session')).toBeTruthy());
    expect(getByTestId('dashboard-next-session').props.children[1].props.children).toBe('Full Body A');

    fireEvent.press(getByTestId('dashboard-start-session'));
    expect(onStartSession).toHaveBeenCalledWith('s1');
  });

  test('UX-3: shows the next incomplete session, skipping completed ones', async () => {
    defaultMocks();
    mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({
      data: [
        {
          session: { id: 'ws1', plannedSessionId: 's1', workoutPlanId: 'plan-1', status: 'completed', startedAt: '', completedAt: '2026-10-01T00:00:00Z' },
          exerciseNames: {},
          setLogs: [],
        },
      ],
      error: null,
    });

    const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('dashboard-next-session')).toBeTruthy());
    expect(getByTestId('dashboard-next-session').props.children[1].props.children).toBe('Full Body B');
  });

  test('UX-3: shows nutrition totals against the current target', async () => {
    defaultMocks();
    mockedApiClient.getFoodLogEntriesForDate.mockResolvedValue({
      data: [
        {
          id: 'e1',
          mealSlot: 'breakfast',
          portionQuantity: 1,
          caloriesPerPortion: 500,
          proteinGPerPortion: 30,
          carbsGPerPortion: 50,
          fatGPerPortion: 10,
          foodItemId: 'food-1',
          foodName: 'Oats',
          portionDescription: '1 bowl',
          logDate: '2026-10-28',
          loggedAt: '',
        },
      ],
      error: null,
    });

    const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('dashboard-nutrition')).toBeTruthy());
    expect(getByTestId('dashboard-nutrition').props.children[1].props.children.join('')).toContain('500 / 2000');
  });

  test('UX-6: shows a recent-achievement card when a PR exists, and nothing when none do', async () => {
    defaultMocks();
    mockedApiClient.getPersonalRecordsForUser.mockResolvedValue({
      data: [
        {
          id: 'pr-1',
          exerciseId: 'ex-squat',
          exerciseName: 'Squat',
          setLogId: 'log-1',
          repCount: 5,
          weightKg: 110,
          estimatedOneRm: 128.3,
          achievedAt: '2026-10-20T00:00:00Z',
        },
        {
          id: 'pr-2',
          exerciseId: 'ex-bench',
          exerciseName: 'Bench Press',
          setLogId: 'log-2',
          repCount: 5,
          weightKg: 70,
          estimatedOneRm: 81.7,
          achievedAt: '2026-10-25T00:00:00Z',
        },
      ],
      error: null,
    });

    const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('dashboard-recent-pr')).toBeTruthy());
    expect(getByTestId('dashboard-recent-pr').props.children[1].props.children.join('')).toContain('Bench Press');
  });

  test('UX-6: no recent-achievement card when there is no PR history', async () => {
    defaultMocks();

    const { queryByTestId, getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());
    expect(queryByTestId('dashboard-recent-pr')).toBeNull();
  });

  test('wires quick-log actions', async () => {
    defaultMocks();
    const onLogFood = jest.fn();
    const onLogWeight = jest.fn();
    const onStartFreeform = jest.fn();
    const onViewHistory = jest.fn();
    const onBrowseMuscles = jest.fn();

    const { getByTestId } = render(
      <DashboardScreen
        client={fakeClient}
        userId="user-1"
        onLogFood={onLogFood}
        onLogWeight={onLogWeight}
        onStartFreeform={onStartFreeform}
        onViewHistory={onViewHistory}
        onBrowseMuscles={onBrowseMuscles}
      />,
    );

    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());
    fireEvent.press(getByTestId('dashboard-quick-log-food'));
    fireEvent.press(getByTestId('dashboard-quick-log-weight'));
    fireEvent.press(getByTestId('dashboard-quick-start-freeform'));
    fireEvent.press(getByTestId('dashboard-quick-view-history'));
    fireEvent.press(getByTestId('dashboard-quick-browse-muscles'));

    expect(onLogFood).toHaveBeenCalled();
    expect(onLogWeight).toHaveBeenCalled();
    expect(onStartFreeform).toHaveBeenCalled();
    expect(onViewHistory).toHaveBeenCalled();
    expect(onBrowseMuscles).toHaveBeenCalled();
  });
});
