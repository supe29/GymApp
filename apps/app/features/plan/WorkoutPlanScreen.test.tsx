import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import WorkoutPlanScreen from './WorkoutPlanScreen';

jest.mock('api-client', () => ({
  getCurrentPlan: jest.fn(),
  generateInitialPlan: jest.fn(),
  buildRegenerationPreview: jest.fn(),
  createWorkoutPlan: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

const persistedPlan = {
  id: 'plan-1',
  splitType: 'full_body' as const,
  planVersion: 1,
  effectiveFrom: '2026-01-01T00:00:00Z',
  sessions: [
    {
      id: 'session-1',
      dayOrder: 1,
      name: 'Full Body',
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
          intensityNote: 'Moderate resistance. (Generated from goal=general_fitness, level=beginner)',
        },
      ],
    },
  ],
};

const emptyDiff = {
  splitTypeChanged: false,
  previousSplitType: 'full_body' as const,
  nextSplitType: 'full_body' as const,
  sessionDiffs: [],
  summaryCounts: {
    sessionsAdded: 0,
    sessionsRemoved: 0,
    exercisesAdded: 0,
    exercisesRemoved: 0,
    prescriptionsChanged: 0,
  },
};

const fakeGeneratedPlan = {
  splitType: 'full_body' as const,
  splitRuleId: 'split-02',
  sessions: [],
  inputsSnapshot: {
    goal: 'general_fitness' as const,
    fitnessLevel: 'beginner' as const,
    trainingDaysPerWeek: 3,
    availableEquipmentKeys: [],
  },
};

describe('WorkoutPlanScreen (FR-2.1/FR-2.2/FR-2.3/FR-2.4/AC-1/AC-2/NFR-7)', () => {
  afterEach(() => jest.clearAllMocks());

  test('renders the current plan with its sessions and exercises', async () => {
    mockedApiClient.getCurrentPlan.mockResolvedValue({ data: persistedPlan, error: null });

    const { getByTestId, getByText } = render(<WorkoutPlanScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('plan-session-1')).toBeTruthy());
    expect(getByText(/v1/)).toBeTruthy();
    expect(getByTestId('plan-exercise-ex-1')).toBeTruthy();
  });

  test('shows the empty state with a generate button when there is no plan yet', async () => {
    mockedApiClient.getCurrentPlan.mockResolvedValue({ data: null, error: null });

    const { getByTestId } = render(<WorkoutPlanScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('plan-empty-state')).toBeTruthy());
    expect(getByTestId('plan-generate-button')).toBeTruthy();
  });

  test('AC-1: pressing generate calls generateInitialPlan and then shows the resulting plan', async () => {
    mockedApiClient.getCurrentPlan.mockResolvedValue({ data: null, error: null });
    mockedApiClient.generateInitialPlan.mockResolvedValue({ data: persistedPlan, error: null });
    const onPlanRegenerated = jest.fn();

    const { getByTestId } = render(
      <WorkoutPlanScreen client={fakeClient} userId="user-1" onPlanRegenerated={onPlanRegenerated} />,
    );
    await waitFor(() => expect(getByTestId('plan-generate-button')).toBeTruthy());

    fireEvent.press(getByTestId('plan-generate-button'));

    await waitFor(() => expect(getByTestId('plan-session-1')).toBeTruthy());
    expect(mockedApiClient.generateInitialPlan).toHaveBeenCalledWith(fakeClient, 'user-1');
    expect(onPlanRegenerated).toHaveBeenCalled();
  });

  test('pressing regenerate previews a diff before writing anything', async () => {
    mockedApiClient.getCurrentPlan.mockResolvedValue({ data: persistedPlan, error: null });
    mockedApiClient.buildRegenerationPreview.mockResolvedValue({
      data: { candidatePlan: fakeGeneratedPlan, diffSummary: emptyDiff, currentPlan: persistedPlan },
      error: null,
    });

    const { getByTestId } = render(<WorkoutPlanScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('plan-regenerate-button')).toBeTruthy());

    fireEvent.press(getByTestId('plan-regenerate-button'));

    await waitFor(() => expect(getByTestId('regenerate-accept')).toBeTruthy());
    expect(mockedApiClient.createWorkoutPlan).not.toHaveBeenCalled();
  });

  test('accepting the regeneration prompt calls createWorkoutPlan with the previewed candidate', async () => {
    mockedApiClient.getCurrentPlan.mockResolvedValue({ data: persistedPlan, error: null });
    mockedApiClient.buildRegenerationPreview.mockResolvedValue({
      data: { candidatePlan: fakeGeneratedPlan, diffSummary: emptyDiff, currentPlan: persistedPlan },
      error: null,
    });
    const updatedPlan = { ...persistedPlan, planVersion: 2 };
    mockedApiClient.createWorkoutPlan.mockResolvedValue({ data: updatedPlan, error: null });
    const onPlanRegenerated = jest.fn();

    const { getByTestId, getByText } = render(
      <WorkoutPlanScreen client={fakeClient} userId="user-1" onPlanRegenerated={onPlanRegenerated} />,
    );
    await waitFor(() => expect(getByTestId('plan-regenerate-button')).toBeTruthy());
    fireEvent.press(getByTestId('plan-regenerate-button'));
    await waitFor(() => expect(getByTestId('regenerate-accept')).toBeTruthy());

    fireEvent.press(getByTestId('regenerate-accept'));

    await waitFor(() => expect(mockedApiClient.createWorkoutPlan).toHaveBeenCalledWith(fakeClient, 'user-1', fakeGeneratedPlan));
    await waitFor(() => expect(getByText(/v2/)).toBeTruthy());
    expect(onPlanRegenerated).toHaveBeenCalled();
  });

  test('declining the regeneration prompt makes no write call and leaves the displayed plan unchanged', async () => {
    mockedApiClient.getCurrentPlan.mockResolvedValue({ data: persistedPlan, error: null });
    mockedApiClient.buildRegenerationPreview.mockResolvedValue({
      data: { candidatePlan: fakeGeneratedPlan, diffSummary: emptyDiff, currentPlan: persistedPlan },
      error: null,
    });

    const { getByTestId, getByText } = render(<WorkoutPlanScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('plan-regenerate-button')).toBeTruthy());
    fireEvent.press(getByTestId('plan-regenerate-button'));
    await waitFor(() => expect(getByTestId('regenerate-decline')).toBeTruthy());

    fireEvent.press(getByTestId('regenerate-decline'));

    await waitFor(() => expect(getByTestId('plan-session-1')).toBeTruthy());
    expect(mockedApiClient.createWorkoutPlan).not.toHaveBeenCalled();
    expect(getByText(/v1/)).toBeTruthy();
  });

  test('the "why" disclosure reveals an exercise\'s generation provenance (NFR-7)', async () => {
    mockedApiClient.getCurrentPlan.mockResolvedValue({ data: persistedPlan, error: null });

    const { getByTestId, queryByTestId } = render(<WorkoutPlanScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('plan-exercise-ex-1')).toBeTruthy());

    expect(queryByTestId('plan-exercise-why-ex-1')).toBeNull();
    fireEvent.press(getByTestId('plan-exercise-why-toggle-ex-1'));
    expect(getByTestId('plan-exercise-why-ex-1').props.children).toContain('Generated from');
  });
});
