import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import MainTabs from './MainTabs';

// MainTabs imports MuscleExplorerScreen (reachable from Dashboard), which
// needs a real WebGL/native GL context for BodyModel that doesn't exist in
// this Jest environment — mocked the same way MuscleExplorerScreen's own
// test suite does, since none of these tests actually navigate into it.
jest.mock('three-model', () => {
  const react = jest.requireActual('react');
  return { BodyModel: react.forwardRef(() => null) };
});

jest.mock('api-client', () => ({
  getCurrentPlan: jest.fn(),
  getWorkoutSessionHistory: jest.fn(),
  getCurrentNutritionTargets: jest.fn(),
  getFoodLogEntriesForDate: jest.fn(),
  getPersonalRecordsForUser: jest.fn(),
  getPendingProgressionSuggestions: jest.fn(),
  updateProgressionSuggestionStatus: jest.fn(),
  getProfile: jest.fn(),
  buildRegenerationPreview: jest.fn(),
  createWorkoutPlan: jest.fn(),
  generateInitialPlan: jest.fn(),
  logFoodEntry: jest.fn(),
  deleteFoodLogEntry: jest.fn(),
  lookupFoodByBarcode: jest.fn(),
  searchFoodItems: jest.fn(),
  getWeightEntries: jest.fn(),
  logWeightEntry: jest.fn(),
  deleteWeightEntry: jest.fn(),
  getUserEquipmentIds: jest.fn(),
  listEquipmentItems: jest.fn(),
  setUserEquipment: jest.fn(),
  updateProfile: jest.fn(),
  requestAccountDeletion: jest.fn(),
  buildNutritionRegenerationPreview: jest.fn(),
  createNutritionTargets: jest.fn(),
  getWorkoutSessionsForDay: jest.fn(),
  getMuscleKeysForExercises: jest.fn(),
  listMuscleGroups: jest.fn(),
  getPlannedSessionById: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockedApiClient.getCurrentPlan.mockResolvedValue({ data: null, error: null });
  mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: null, error: null });
  mockedApiClient.getFoodLogEntriesForDate.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getPersonalRecordsForUser.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getPendingProgressionSuggestions.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getProfile.mockResolvedValue({
    data: {
      user_id: 'user-1',
      age: 30,
      height_cm: 175,
      weight_kg: 75,
      biological_sex: 'prefer_not_to_say',
      fitness_level: 'beginner',
      goal: 'general_fitness',
      training_days_per_week: 3,
      unit_preference: 'metric',
    } as never,
    error: null,
  });
  mockedApiClient.getWeightEntries.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
  mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getWorkoutSessionsForDay.mockResolvedValue({ data: [], error: null });
  mockedApiClient.getMuscleKeysForExercises.mockResolvedValue({ data: new Map(), error: null });
  mockedApiClient.listMuscleGroups.mockResolvedValue({ data: [], error: null });
});

function renderMainTabs() {
  return render(
    <NavigationContainer>
      <MainTabs client={fakeClient} userId="user-1" />
    </NavigationContainer>,
  );
}

describe('MainTabs (UX-3/FR-8.3)', () => {
  test('starts on the Dashboard tab', async () => {
    const { getByTestId } = renderMainTabs();
    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());
  });

  test('switches to the Plan tab', async () => {
    const { getByText, getByTestId } = renderMainTabs();
    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());

    fireEvent.press(getByText('Plan'));
    await waitFor(() => expect(getByTestId('plan-empty-state')).toBeTruthy());
  });

  test('switches to the Nutrition tab and can reach nutrition targets via the header button', async () => {
    const { getByText, getByTestId } = renderMainTabs();
    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());

    fireEvent.press(getByText('Nutrition'));
    await waitFor(() => expect(getByTestId('diary-screen')).toBeTruthy());

    fireEvent.press(getByText('Targets'));
    await waitFor(() => expect(getByTestId('nutrition-empty-state')).toBeTruthy());
  });

  test('FR-8.5: the Progress tab opens on Body progress, with weight and records via the header buttons', async () => {
    const { getByText, getByTestId } = renderMainTabs();
    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());

    fireEvent.press(getByText('Progress'));
    await waitFor(() => expect(getByTestId('body-progress-screen')).toBeTruthy());

    fireEvent.press(getByText('Weight'));
    await waitFor(() => expect(getByTestId('weight-trend-screen')).toBeTruthy());

    fireEvent.press(getByText('Records'));
    await waitFor(() => expect(getByTestId('personal-records-screen')).toBeTruthy());
  });

  test('Dashboard "Log weight" quick action still lands on the weight trend', async () => {
    const { getByTestId } = renderMainTabs();
    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());

    fireEvent.press(getByTestId('dashboard-quick-log-weight'));
    await waitFor(() => expect(getByTestId('weight-trend-screen')).toBeTruthy());
  });

  test('switches to the Profile tab', async () => {
    const { getByText, getByTestId } = renderMainTabs();
    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());

    fireEvent.press(getByText('Profile'));
    await waitFor(() => expect(getByTestId('edit-profile-age')).toBeTruthy());
  });

  test('Dashboard "Log food" quick action switches to the Nutrition tab', async () => {
    const { getByTestId } = renderMainTabs();
    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());

    fireEvent.press(getByTestId('dashboard-quick-log-food'));
    await waitFor(() => expect(getByTestId('diary-screen')).toBeTruthy());
  });

  test('UX-3: the dashboard reloads when you come back to it, so totals are never stale', async () => {
    const { getByTestId, getByText } = renderMainTabs();
    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());
    // Only the dashboard loads the plan here (the Plan tab is never opened), so each call is a dashboard load.
    const dashboardLoads = mockedApiClient.getCurrentPlan.mock.calls.length;

    fireEvent.press(getByTestId('dashboard-quick-log-food'));
    await waitFor(() => expect(getByTestId('diary-screen')).toBeTruthy());
    expect(mockedApiClient.getCurrentPlan.mock.calls.length).toBe(dashboardLoads);

    fireEvent.press(getByText('Dashboard'));
    await waitFor(() => expect(mockedApiClient.getCurrentPlan.mock.calls.length).toBe(dashboardLoads + 1));
  });
});
