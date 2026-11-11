import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import WorkoutPlanScreen from './WorkoutPlanScreen';

jest.mock('api-client', () => ({
  getCurrentPlan: jest.fn(),
  generateInitialPlan: jest.fn(),
  buildRegenerationPreview: jest.fn(),
  createWorkoutPlan: jest.fn(),
  getMuscleKeysForExercises: jest.fn(),
  listMuscleGroups: jest.fn(),
  getProfile: jest.fn(),
  updateTrainingWeekdays: jest.fn(),
  getWorkoutSessionHistory: jest.fn(),
  getScheduleAdjustments: jest.fn(),
  createScheduleAdjustment: jest.fn(),
  deleteScheduleAdjustment: jest.fn(),
  acceptPlanWithPreferences: jest.fn(),
}));

const mocked = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;
// Wednesday 11 Nov 2026, midday local.
const NOW = new Date(2026, 10, 11, 12, 0);

function exercise(id: string, name: string) {
  return { id: `pse-${id}`, exerciseId: id, exerciseName: name, orderIndex: 0, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, targetWeightKg: null, intensityNote: 'Moderate.' };
}

const PLAN = {
  id: 'plan-1',
  splitType: 'full_body' as const,
  planVersion: 1,
  effectiveFrom: '',
  sessions: [
    { id: 'A', dayOrder: 1, name: 'Full Body A', exercises: [exercise('squat', 'Barbell Squat')] },
    { id: 'B', dayOrder: 2, name: 'Full Body B', exercises: [exercise('deadlift', 'Deadlift')] },
    { id: 'C', dayOrder: 3, name: 'Full Body C', exercises: [exercise('lunge', 'Lunge')] },
  ],
};

function profile(weekdays: number[] | null) {
  return {
    data: { training_days_per_week: 3, training_weekdays: weekdays, unit_preference: 'metric', goal: 'general_fitness', fitness_level: 'beginner', plan_preferences: null } as never,
    error: null,
  };
}

function mocks(weekdays: number[] | null = [1, 3, 5]) {
  mocked.getCurrentPlan.mockResolvedValue({ data: PLAN, error: null });
  mocked.getProfile.mockResolvedValue(profile(weekdays));
  mocked.getMuscleKeysForExercises.mockResolvedValue({ data: new Map(), error: null });
  mocked.listMuscleGroups.mockResolvedValue({ data: [], error: null });
  mocked.getWorkoutSessionHistory.mockResolvedValue({ data: [], error: null });
  mocked.getScheduleAdjustments.mockResolvedValue({ data: [], error: null });
  mocked.createScheduleAdjustment.mockResolvedValue({ data: {} as never, error: null });
  mocked.deleteScheduleAdjustment.mockResolvedValue({ data: null, error: null });
}

function renderPlan(props: Partial<React.ComponentProps<typeof WorkoutPlanScreen>> = {}) {
  return render(<WorkoutPlanScreen client={fakeClient} userId="user-1" now={NOW} {...props} />);
}

describe('WorkoutPlanScreen week view (FR-2.5/FR-2.6/AC-16/AC-17)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('without chosen weekdays it asks for them, prefilled with an even spread, and saves', async () => {
    mocks(null);
    mocked.updateTrainingWeekdays.mockResolvedValue(profile([1, 3, 5]) as never);

    const { getByTestId, findByTestId } = renderPlan();

    await findByTestId('plan-weekday-picker');
    expect(getByTestId('plan-weekday-1').props.accessibilityState.checked).toBe(true);
    expect(getByTestId('plan-weekday-3').props.accessibilityState.checked).toBe(true);
    expect(getByTestId('plan-weekday-5').props.accessibilityState.checked).toBe(true);

    fireEvent.press(getByTestId('plan-weekday-save'));

    await waitFor(() => expect(mocked.updateTrainingWeekdays).toHaveBeenCalledWith(fakeClient, 'user-1', [1, 3, 5]));
    await findByTestId('plan-week-title');
  });

  test('requires exactly the right number of days before saving', async () => {
    mocks(null);
    const { getByTestId, findByTestId } = renderPlan();
    await findByTestId('plan-weekday-picker');

    fireEvent.press(getByTestId('plan-weekday-5'));
    expect(getByTestId('plan-weekday-save').props.accessibilityState?.disabled ?? getByTestId('plan-weekday-save').props.disabled).toBeTruthy();
    fireEvent.press(getByTestId('plan-weekday-6'));
    fireEvent.press(getByTestId('plan-weekday-save'));
    await waitFor(() => expect(mocked.updateTrainingWeekdays).toHaveBeenCalledWith(fakeClient, 'user-1', [1, 3, 6]));
  });

  test('lays the week out day by day with statuses and rest days', async () => {
    mocks();
    const { findByTestId, getByTestId } = renderPlan();

    await findByTestId('plan-week-title');
    expect(within(getByTestId('plan-day-2026-11-09')).getByText('Full Body A')).toBeTruthy();
    expect(getByTestId('plan-session-1-status').props.children).toBe('Missed');
    expect(within(getByTestId('plan-day-2026-11-10')).getByText('Rest day')).toBeTruthy();
    expect(getByTestId('plan-session-2-status').props.children).toBe('Today');
    expect(within(getByTestId('plan-day-2026-11-13')).getByText('Full Body C')).toBeTruthy();
  });

  test('a session done earlier in the week shows as done, with no missed card', async () => {
    mocks();
    mocked.getWorkoutSessionHistory.mockResolvedValue({
      data: [
        {
          session: { id: 'ws1', plannedSessionId: 'A', workoutPlanId: 'plan-1', status: 'completed', startedAt: '', completedAt: new Date(2026, 10, 10, 18).toISOString() },
          exerciseNames: {},
          setLogs: [],
        },
      ],
      error: null,
    });
    const { findByTestId, queryByTestId } = renderPlan();

    expect((await findByTestId('plan-session-1-status')).props.children).toBe('Done ✓');
    expect(queryByTestId('missed-session-A')).toBeNull();
  });

  test('a missed session gets a recommendation, and choosing "Do it today" moves it and shifts today’s session', async () => {
    mocks();
    const { findByTestId, getByTestId } = renderPlan();

    await findByTestId('missed-session-A');
    expect(getByTestId('missed-session-A-recommendation').props.children).toBe('Suggested: Do it today');
    expect(getByTestId('missed-session-A-reason').props.children).toContain('move Full Body B to Thu');

    await act(async () => {
      fireEvent.press(getByTestId('missed-session-A-option-move'));
    });

    expect(mocked.createScheduleAdjustment).toHaveBeenCalledWith(fakeClient, 'user-1', {
      workoutPlanId: 'plan-1',
      weekStart: '2026-11-09',
      plannedSessionId: 'B',
      action: 'move',
      targetDate: '2026-11-12',
    });
    expect(mocked.createScheduleAdjustment).toHaveBeenCalledWith(fakeClient, 'user-1', {
      workoutPlanId: 'plan-1',
      weekStart: '2026-11-09',
      plannedSessionId: 'A',
      action: 'move',
      targetDate: '2026-11-11',
    });
    expect(mocked.getScheduleAdjustments).toHaveBeenCalledTimes(2);
  });

  test('skip and merge write their own choices', async () => {
    mocks();
    const { findByTestId, getByTestId } = renderPlan();
    await findByTestId('missed-session-A');

    await act(async () => {
      fireEvent.press(getByTestId('missed-session-A-option-merge'));
    });
    expect(mocked.createScheduleAdjustment).toHaveBeenLastCalledWith(
      fakeClient,
      'user-1',
      expect.objectContaining({ plannedSessionId: 'A', action: 'merge', mergeIntoPlannedSessionId: 'B' }),
    );

    await act(async () => {
      fireEvent.press(getByTestId('missed-session-A-option-skip'));
    });
    expect(mocked.createScheduleAdjustment).toHaveBeenLastCalledWith(
      fakeClient,
      'user-1',
      expect.objectContaining({ plannedSessionId: 'A', action: 'skip' }),
    );
  });

  test('a saved merge shows on the target session, starts both together, and can be undone', async () => {
    mocks();
    mocked.getScheduleAdjustments.mockResolvedValue({
      data: [
        { id: 'adj-merge', workoutPlanId: 'plan-1', weekStart: '2026-11-09', plannedSessionId: 'A', action: 'merge', targetDate: null, mergeIntoPlannedSessionId: 'B' },
      ],
      error: null,
    });
    const onStartSession = jest.fn();
    const { findByTestId, getByTestId, queryByTestId } = renderPlan({ onStartSession });

    expect((await findByTestId('plan-session-2-merged')).props.children).toContain('Includes Full Body A');
    expect(queryByTestId('missed-session-A')).toBeNull();

    fireEvent.press(getByTestId('plan-session-2-start'));
    expect(onStartSession).toHaveBeenCalledWith('B', 'A');

    await act(async () => {
      fireEvent.press(getByTestId('plan-session-2-undo'));
    });
    expect(mocked.deleteScheduleAdjustment).toHaveBeenCalledWith(fakeClient, 'user-1', 'adj-merge');
  });

  test("Start on today's session calls onStartSession", async () => {
    mocks();
    const onStartSession = jest.fn();
    const { findByTestId } = renderPlan({ onStartSession });

    fireEvent.press(await findByTestId('plan-session-2-start'));
    expect(onStartSession).toHaveBeenCalledWith('B', undefined);
  });

  test('next week shows the same layout without missed cards or Start buttons', async () => {
    mocks();
    const { findByTestId, getByTestId, queryByTestId } = renderPlan({ onStartSession: jest.fn() });
    await findByTestId('missed-session-A');

    fireEvent.press(getByTestId('plan-week-toggle'));

    expect((await findByTestId('plan-week-title')).props.children).toBe('Next week');
    await waitFor(() => expect(getByTestId('plan-day-2026-11-16')).toBeTruthy());
    expect(queryByTestId('missed-session-A')).toBeNull();
    expect(queryByTestId('plan-session-2-start')).toBeNull();
  });

  test('undoing either half of "Do it today" reverses both moves', async () => {
    mocks();
    mocked.getScheduleAdjustments.mockResolvedValue({
      data: [
        { id: 'adj-b', workoutPlanId: 'plan-1', weekStart: '2026-11-09', plannedSessionId: 'B', action: 'move', targetDate: '2026-11-12', mergeIntoPlannedSessionId: null },
        { id: 'adj-a', workoutPlanId: 'plan-1', weekStart: '2026-11-09', plannedSessionId: 'A', action: 'move', targetDate: '2026-11-11', mergeIntoPlannedSessionId: null },
      ],
      error: null,
    });
    const { findByTestId, getByTestId } = renderPlan();

    // B was pushed from Wed to Thu; undo it from B's row.
    await findByTestId('plan-session-2-undo');
    expect(within(getByTestId('plan-day-2026-11-11')).getByText('Full Body A')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('plan-session-2-undo'));
    });

    expect(mocked.deleteScheduleAdjustment).toHaveBeenCalledWith(fakeClient, 'user-1', 'adj-b');
    expect(mocked.deleteScheduleAdjustment).toHaveBeenCalledWith(fakeClient, 'user-1', 'adj-a');
  });

  describe('FR-2.7: customising day focus', () => {
    const preview = {
      candidatePlan: { splitType: 'push_pull_legs', splitRuleId: 'split-02', sessions: [], inputsSnapshot: {} } as never,
      diffSummary: {
        splitTypeChanged: true,
        previousSplitType: 'full_body' as const,
        nextSplitType: 'push_pull_legs' as const,
        sessionDiffs: [],
        summaryCounts: { sessionsAdded: 0, sessionsRemoved: 0, exercisesAdded: 3, exercisesRemoved: 3, prescriptionsChanged: 0 },
      },
      currentPlan: PLAN,
    };

    test('Customise workouts → choose a split → preview the diff → accept saves the preference and the new plan', async () => {
      mocks();
      mocked.buildRegenerationPreview.mockResolvedValue({ data: preview as never, error: null });
      mocked.acceptPlanWithPreferences.mockResolvedValue({ data: { ...PLAN, id: 'plan-2', planVersion: 2 }, error: null });
      const onPlanRegenerated = jest.fn();
      const { findByTestId, getByTestId } = renderPlan({ onPlanRegenerated });

      fireEvent.press(await findByTestId('plan-customise-days'));
      fireEvent.press(getByTestId('plan-split-push_pull_legs'));
      await act(async () => {
        fireEvent.press(getByTestId('plan-day-focus-preview'));
      });

      expect(mocked.buildRegenerationPreview).toHaveBeenCalledWith(fakeClient, 'user-1', { preferences: { split: 'push_pull_legs' } });
      await act(async () => {
        fireEvent.press(await findByTestId('regenerate-accept'));
      });

      expect(mocked.acceptPlanWithPreferences).toHaveBeenCalledWith(
        fakeClient,
        'user-1',
        { split: 'push_pull_legs' },
        preview.candidatePlan,
        null,
      );
      expect(mocked.createWorkoutPlan).not.toHaveBeenCalled();
      expect(onPlanRegenerated).toHaveBeenCalled();
      expect((await findByTestId('plan-version-badge')).props.children).toEqual(['v', 2]);
    });

    test('declining the preview saves nothing', async () => {
      mocks();
      mocked.buildRegenerationPreview.mockResolvedValue({ data: preview as never, error: null });
      const { findByTestId, getByTestId } = renderPlan();

      fireEvent.press(await findByTestId('plan-customise-days'));
      await act(async () => {
        fireEvent.press(getByTestId('plan-day-focus-preview'));
      });
      fireEvent.press(await findByTestId('regenerate-decline'));

      expect(mocked.acceptPlanWithPreferences).not.toHaveBeenCalled();
      expect(mocked.createWorkoutPlan).not.toHaveBeenCalled();
    });

    test('after saving new training days, it offers to update the workouts to match', async () => {
      mocks(null);
      mocked.updateTrainingWeekdays.mockResolvedValue(profile([1, 3, 5]) as never);
      mocked.buildRegenerationPreview.mockResolvedValue({ data: preview as never, error: null });
      const { findByTestId } = renderPlan();

      fireEvent.press(await findByTestId('plan-weekday-save'));
      fireEvent.press(await findByTestId('plan-days-changed-preview'));

      await waitFor(() => expect(mocked.buildRegenerationPreview).toHaveBeenCalledWith(fakeClient, 'user-1'));
    });
  });
});
