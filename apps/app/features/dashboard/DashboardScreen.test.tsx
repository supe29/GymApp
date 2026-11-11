import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import DashboardScreen from './DashboardScreen';

jest.mock('api-client', () => ({
  getCurrentPlan: jest.fn(),
  getWorkoutSessionHistory: jest.fn(),
  getCurrentNutritionTargets: jest.fn(),
  getFoodLogEntriesForDate: jest.fn(),
  getPersonalRecordsForUser: jest.fn(),
  getProfile: jest.fn(),
  getWeightEntries: jest.fn(),
  getPendingProgressionSuggestions: jest.fn(),
  updateProgressionSuggestionStatus: jest.fn(),
  getScheduleAdjustments: jest.fn(() => Promise.resolve({ data: [], error: null })),
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
    {
      id: 's2',
      dayOrder: 2,
      name: 'Full Body B',
      exercises: [
        { id: 'pse-1', exerciseId: 'ex-1', exerciseName: 'Squat', orderIndex: 0, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, targetWeightKg: null, intensityNote: null },
      ],
    },
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

function completedSession(id: string, plannedSessionId: string | null, completedAt: string) {
  return {
    session: { id, plannedSessionId, workoutPlanId: 'plan-1', status: 'completed' as const, startedAt: completedAt, completedAt },
    exerciseNames: {},
    setLogs: [],
  };
}

function defaultMocks() {
  mockedApiClient.getCurrentPlan.mockResolvedValue({ data: PLAN, error: null });
  mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: TARGETS, error: null });
  mockedApiClient.getFoodLogEntriesForDate.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getPersonalRecordsForUser.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getProfile.mockResolvedValue({ data: { unit_preference: 'metric' } as never, error: null });
  mockedApiClient.getWeightEntries.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getPendingProgressionSuggestions.mockResolvedValue({ data: [], error: null });
}

describe('DashboardScreen (UX-3/UX-6/UX-9)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('next session', () => {
    test('UX-3: shows the next planned session with a working start-session button', async () => {
      defaultMocks();
      const onStartSession = jest.fn();

      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" onStartSession={onStartSession} />);

      await waitFor(() => expect(getByTestId('dashboard-next-session')).toBeTruthy());
      expect(getByTestId('dashboard-next-session-name').props.children).toBe('Full Body A');
      expect(getByTestId('dashboard-next-session-detail').props.children).toBe('Day 1 of 2 · 0 exercises');

      fireEvent.press(getByTestId('dashboard-start-session'));
      expect(onStartSession).toHaveBeenCalledWith('s1');
    });

    test('UX-3: shows the session after the most recently completed one', async () => {
      defaultMocks();
      mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({
        data: [completedSession('ws1', 's1', '2026-10-01T00:00:00Z')],
        error: null,
      });

      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

      await waitFor(() => expect(getByTestId('dashboard-next-session-name').props.children).toBe('Full Body B'));
      expect(getByTestId('dashboard-next-session-detail').props.children).toBe('Day 2 of 2 · 1 exercise');
    });

    test('UX-3: wraps back to day 1 after a full cycle instead of sticking', async () => {
      defaultMocks();
      // Most recent first: s2 was done last, after s1.
      mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({
        data: [completedSession('ws2', 's2', '2026-10-03T00:00:00Z'), completedSession('ws1', 's1', '2026-10-01T00:00:00Z')],
        error: null,
      });

      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

      await waitFor(() => expect(getByTestId('dashboard-next-session-name').props.children).toBe('Full Body A'));
    });

    test('UX-9: no plan shows an empty state that leads to plan creation', async () => {
      defaultMocks();
      mockedApiClient.getCurrentPlan.mockResolvedValue({ data: null, error: null });
      const onCreatePlan = jest.fn();

      const { getByTestId, queryByTestId } = render(
        <DashboardScreen client={fakeClient} userId="user-1" onCreatePlan={onCreatePlan} />,
      );

      await waitFor(() => expect(getByTestId('dashboard-empty-plan')).toBeTruthy());
      expect(queryByTestId('dashboard-next-session')).toBeNull();
      expect(queryByTestId('dashboard-week')).toBeNull();
      fireEvent.press(getByTestId('dashboard-empty-plan-action'));
      expect(onCreatePlan).toHaveBeenCalled();
    });
  });

  test('UX-3: counts sessions completed this week against the plan', async () => {
    defaultMocks();
    const now = new Date();
    const lastYear = new Date(now.getFullYear() - 1, 0, 1).toISOString();
    mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({
      data: [completedSession('ws2', 's1', now.toISOString()), completedSession('ws1', 's2', lastYear)],
      error: null,
    });

    const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('dashboard-week-count').props.children).toBe('1 of 2 sessions'));
  });

  describe('nutrition', () => {
    test('UX-3: shows calories and all three macros against the current target', async () => {
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
      expect(getByTestId('dashboard-macro-calories-value').props.children).toContain('500 / 2000');
      expect(getByTestId('dashboard-macro-protein-value').props.children).toBe('30g / 150g');
      expect(getByTestId('dashboard-macro-carbs-value').props.children).toBe('50g / 200g');
      expect(getByTestId('dashboard-macro-fat-value').props.children).toBe('10g / 60g');
      expect(getByTestId('dashboard-calories-remaining').props.children).toBe('1500 kcal left');
      expect(getByTestId('dashboard-macro-calories-bar')).toHaveStyle({ width: '25%' });
    });

    test("asks for today's food by local calendar date", async () => {
      defaultMocks();
      render(<DashboardScreen client={fakeClient} userId="user-1" />);

      const now = new Date();
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      await waitFor(() =>
        expect(mockedApiClient.getFoodLogEntriesForDate).toHaveBeenCalledWith(fakeClient, 'user-1', expected),
      );
    });

    test('UX-9: no targets shows an empty state that leads to target setup', async () => {
      defaultMocks();
      mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: null, error: null });
      const onSetTargets = jest.fn();

      const { getByTestId, queryByTestId } = render(
        <DashboardScreen client={fakeClient} userId="user-1" onSetTargets={onSetTargets} />,
      );

      await waitFor(() => expect(getByTestId('dashboard-empty-targets')).toBeTruthy());
      expect(queryByTestId('dashboard-nutrition')).toBeNull();
      fireEvent.press(getByTestId('dashboard-empty-targets-action'));
      expect(onSetTargets).toHaveBeenCalled();
    });
  });

  describe('body weight', () => {
    test('FR-8.1: shows the latest weight and its 7-day change, and opens the trend', async () => {
      defaultMocks();
      const day = 24 * 60 * 60 * 1000;
      mockedApiClient.getWeightEntries.mockResolvedValue({
        data: [
          { id: 'w1', weightKg: 82, measuredAt: new Date(Date.now() - 10 * day).toISOString() },
          { id: 'w2', weightKg: 80.5, measuredAt: new Date(Date.now() - day).toISOString() },
        ],
        error: null,
      });
      const onViewWeight = jest.fn();

      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" onViewWeight={onViewWeight} />);

      await waitFor(() => expect(getByTestId('dashboard-weight')).toBeTruthy());
      expect(getByTestId('dashboard-weight-latest').props.children).toBe('80.5 kg');
      expect(getByTestId('dashboard-weight-change').props.children).toBe('−1.5 kg in 7 days');
      fireEvent.press(getByTestId('dashboard-weight'));
      expect(onViewWeight).toHaveBeenCalled();
    });

    test('with no entries, prompts for a first weigh-in', async () => {
      defaultMocks();
      const onLogWeight = jest.fn();

      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" onLogWeight={onLogWeight} />);

      await waitFor(() => expect(getByTestId('dashboard-weight-empty')).toBeTruthy());
      fireEvent.press(getByTestId('dashboard-weight-empty'));
      expect(onLogWeight).toHaveBeenCalled();
    });
  });

  describe('progression suggestions', () => {
    const suggestion = {
      id: 'sugg-1',
      exerciseId: 'ex-1',
      exerciseName: 'Squat',
      sourceWorkoutSessionId: 'ws1',
      action: 'increase_weight' as const,
      suggestedWeightKg: 62.5,
      suggestedReps: 8,
      rationale: 'You hit the top of the rep range on every set.',
      status: 'pending' as const,
      overriddenWeightKg: null,
      overriddenReps: null,
      createdAt: '2026-11-10T00:00:00Z',
    };

    test('UX-6: shows pending suggestions and records an accept', async () => {
      defaultMocks();
      mockedApiClient.getPendingProgressionSuggestions.mockResolvedValue({ data: [suggestion], error: null });
      mockedApiClient.updateProgressionSuggestionStatus.mockResolvedValue({ data: { ...suggestion, status: 'accepted' }, error: null });

      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

      await waitFor(() => expect(getByTestId('dashboard-suggestions')).toBeTruthy());
      fireEvent.press(getByTestId('progression-card-ex-1-accept'));

      await waitFor(() => expect(getByTestId('progression-card-ex-1-resolved').props.children).toBe('Accepted'));
      expect(mockedApiClient.updateProgressionSuggestionStatus).toHaveBeenCalledWith(fakeClient, 'user-1', 'sugg-1', {
        status: 'accepted',
      });
    });

    test('shows at most three cards and counts the rest', async () => {
      defaultMocks();
      mockedApiClient.getPendingProgressionSuggestions.mockResolvedValue({
        data: [1, 2, 3, 4, 5].map((n) => ({ ...suggestion, id: `sugg-${n}`, exerciseId: `ex-${n}` })),
        error: null,
      });

      const { getByTestId, queryByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

      await waitFor(() => expect(getByTestId('dashboard-suggestions')).toBeTruthy());
      expect(getByTestId('progression-card-ex-3')).toBeTruthy();
      expect(queryByTestId('progression-card-ex-4')).toBeNull();
      expect(getByTestId('dashboard-suggestions-more').props.children).toBe('+2 more after these');
    });

    test('a failed suggestions query just hides the card', async () => {
      defaultMocks();
      mockedApiClient.getPendingProgressionSuggestions.mockRejectedValue(new Error('offline'));

      const { getByTestId, queryByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

      await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());
      expect(queryByTestId('dashboard-suggestions')).toBeNull();
      expect(queryByTestId('dashboard-error')).toBeNull();
    });
  });

  describe('recent achievement', () => {
    test('UX-6: shows the most recent PR', async () => {
      defaultMocks();
      mockedApiClient.getPersonalRecordsForUser.mockResolvedValue({
        data: [
          { id: 'pr-1', exerciseId: 'ex-squat', exerciseName: 'Squat', setLogId: 'log-1', repCount: 5, weightKg: 110, estimatedOneRm: 128.3, achievedAt: '2026-10-20T00:00:00Z' },
          { id: 'pr-2', exerciseId: 'ex-bench', exerciseName: 'Bench Press', setLogId: 'log-2', repCount: 5, weightKg: 70, estimatedOneRm: 81.7, achievedAt: '2026-10-25T00:00:00Z' },
        ],
        error: null,
      });

      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

      await waitFor(() => expect(getByTestId('dashboard-recent-pr')).toBeTruthy());
      expect(getByTestId('dashboard-recent-pr-detail').props.children).toBe('Bench Press: 5-rep PR at 70.0 kg');
    });

    test('UX-6: no recent-achievement card when there is no PR history', async () => {
      defaultMocks();

      const { queryByTestId, getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

      await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());
      expect(queryByTestId('dashboard-recent-pr')).toBeNull();
    });
  });

  describe('loading and refreshing', () => {
    test('a failed load shows an error with retry instead of loading forever', async () => {
      defaultMocks();
      mockedApiClient.getCurrentPlan.mockRejectedValueOnce(new Error('network down'));

      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

      await waitFor(() => expect(getByTestId('dashboard-error')).toBeTruthy());
      fireEvent.press(getByTestId('dashboard-retry'));
      await waitFor(() => expect(getByTestId('dashboard-next-session')).toBeTruthy());
    });

    test('an API error result also shows the error state', async () => {
      defaultMocks();
      mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: null, error: 'permission denied' });

      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" />);

      await waitFor(() => expect(getByTestId('dashboard-error')).toBeTruthy());
    });

    test('reloads when refreshToken changes, e.g. on returning to the tab', async () => {
      defaultMocks();
      const { getByTestId, rerender } = render(<DashboardScreen client={fakeClient} userId="user-1" refreshToken={0} />);
      await waitFor(() => expect(getByTestId('dashboard-next-session-name').props.children).toBe('Full Body A'));

      mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({
        data: [completedSession('ws1', 's1', new Date().toISOString())],
        error: null,
      });
      await act(async () => {
        rerender(<DashboardScreen client={fakeClient} userId="user-1" refreshToken={1} />);
      });

      await waitFor(() => expect(getByTestId('dashboard-next-session-name').props.children).toBe('Full Body B'));
      expect(mockedApiClient.getCurrentPlan).toHaveBeenCalledTimes(2);
    });
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

  describe('FR-2.5/FR-2.6: with chosen training weekdays', () => {
    // Wednesday 11 Nov 2026; the plan's two sessions fall on Mon and Wed.
    const WEDNESDAY = new Date(2026, 10, 11, 12, 0);

    function weekdayMocks(completed: { plannedSessionId: string; completedAt: string }[] = []) {
      defaultMocks();
      mockedApiClient.getProfile.mockResolvedValue({
        data: { unit_preference: 'metric', training_days_per_week: 2, training_weekdays: [1, 3] } as never,
        error: null,
      });
      mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({
        data: completed.map((c, i) => completedSession(`ws${i}`, c.plannedSessionId, c.completedAt)),
        error: null,
      });
    }

    test("next session is today's scheduled one, and the week counts against the chosen days", async () => {
      weekdayMocks();
      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" now={WEDNESDAY} />);

      await waitFor(() => expect(getByTestId('dashboard-next-session-name').props.children).toBe('Full Body B'));
      expect(getByTestId('dashboard-next-session-detail').props.children).toBe('Today · 1 exercise');
      expect(getByTestId('dashboard-week-count').props.children).toBe('0 of 2 sessions');
    });

    test('a missed session shows a compact suggestion that opens the Plan tab', async () => {
      weekdayMocks();
      const onOpenPlan = jest.fn();
      const { getByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" now={WEDNESDAY} onOpenPlan={onOpenPlan} />);

      await waitFor(() => expect(getByTestId('missed-session-s1')).toBeTruthy());
      expect(getByTestId('missed-session-s1-recommendation').props.children).toMatch(/^Suggested: /);
      fireEvent.press(getByTestId('missed-session-s1-see-options'));
      expect(onOpenPlan).toHaveBeenCalled();
    });

    test('when every session this week is done, it says the week is complete', async () => {
      weekdayMocks([
        { plannedSessionId: 's1', completedAt: new Date(2026, 10, 9, 18).toISOString() },
        { plannedSessionId: 's2', completedAt: new Date(2026, 10, 11, 9).toISOString() },
      ]);
      const { getByTestId, queryByTestId } = render(<DashboardScreen client={fakeClient} userId="user-1" now={WEDNESDAY} />);

      await waitFor(() => expect(getByTestId('dashboard-week-complete')).toBeTruthy());
      expect(queryByTestId('dashboard-next-session')).toBeNull();
      expect(getByTestId('dashboard-week-count').props.children).toBe('2 of 2 sessions');
    });
  });
});
