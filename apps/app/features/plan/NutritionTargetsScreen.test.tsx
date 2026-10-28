import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import NutritionTargetsScreen from './NutritionTargetsScreen';

jest.mock('api-client', () => ({
  getCurrentNutritionTargets: jest.fn(),
  generateInitialNutritionTargets: jest.fn(),
  buildNutritionRegenerationPreview: jest.fn(),
  createNutritionTargets: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

const persistedTargets = {
  id: 'targets-1',
  dailyCalories: 2000,
  proteinG: 150,
  carbsG: 200,
  fatG: 55,
  targetVersion: 1,
  effectiveFrom: '2026-01-01T00:00:00Z',
};

const emptyNutritionDiff = {
  changed: false,
  previous: { dailyCalories: 2000, proteinG: 150, carbsG: 200, fatG: 55 },
  next: { dailyCalories: 2000, proteinG: 150, carbsG: 200, fatG: 55 },
  deltas: { dailyCalories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
};

const fakeCandidateTargets = {
  dailyCalories: 1800,
  proteinG: 160,
  carbsG: 170,
  fatG: 50,
  unsafeConfigurationWarning: null as string | null,
  provenance: {
    bmr: 1600,
    tdee: 1900,
    activityMultiplier: 1.2,
    goalAdjustmentFraction: -0.2,
    preClampCalories: 1800,
    calorieFloor: 1500,
    floorApplied: false,
  },
};

describe('NutritionTargetsScreen (FR-3.1/FR-3.2/FR-3.3/FR-2.4/AC-1/NFR-7)', () => {
  afterEach(() => jest.clearAllMocks());

  test('renders the current targets', async () => {
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: persistedTargets, error: null });

    const { getByTestId, getByText } = render(<NutritionTargetsScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('nutrition-targets-calories')).toBeTruthy());
    expect(getByText(/v1/)).toBeTruthy();
    expect(getByTestId('nutrition-targets-protein')).toBeTruthy();
  });

  test('shows the empty state with a generate button when there are no targets yet', async () => {
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: null, error: null });

    const { getByTestId } = render(<NutritionTargetsScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('nutrition-empty-state')).toBeTruthy());
    expect(getByTestId('nutrition-generate-button')).toBeTruthy();
  });

  test('AC-1: pressing generate calls generateInitialNutritionTargets and then shows the resulting targets', async () => {
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: null, error: null });
    mockedApiClient.generateInitialNutritionTargets.mockResolvedValue({ data: persistedTargets, error: null });
    const onTargetsRegenerated = jest.fn();

    const { getByTestId } = render(
      <NutritionTargetsScreen client={fakeClient} userId="user-1" onTargetsRegenerated={onTargetsRegenerated} />,
    );
    await waitFor(() => expect(getByTestId('nutrition-generate-button')).toBeTruthy());

    fireEvent.press(getByTestId('nutrition-generate-button'));

    await waitFor(() => expect(getByTestId('nutrition-targets-calories')).toBeTruthy());
    expect(mockedApiClient.generateInitialNutritionTargets).toHaveBeenCalledWith(fakeClient, 'user-1');
    expect(onTargetsRegenerated).toHaveBeenCalled();
  });

  test('pressing regenerate previews a diff before writing anything', async () => {
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: persistedTargets, error: null });
    mockedApiClient.buildNutritionRegenerationPreview.mockResolvedValue({
      data: { candidateTargets: fakeCandidateTargets, diffSummary: emptyNutritionDiff, currentTargets: persistedTargets },
      error: null,
    });

    const { getByTestId } = render(<NutritionTargetsScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('nutrition-regenerate-button')).toBeTruthy());

    fireEvent.press(getByTestId('nutrition-regenerate-button'));

    await waitFor(() => expect(getByTestId('regenerate-accept')).toBeTruthy());
    expect(mockedApiClient.createNutritionTargets).not.toHaveBeenCalled();
  });

  test('accepting the regeneration prompt calls createNutritionTargets with the previewed candidate', async () => {
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: persistedTargets, error: null });
    mockedApiClient.buildNutritionRegenerationPreview.mockResolvedValue({
      data: { candidateTargets: fakeCandidateTargets, diffSummary: emptyNutritionDiff, currentTargets: persistedTargets },
      error: null,
    });
    const updatedTargets = { ...persistedTargets, targetVersion: 2, dailyCalories: 1800 };
    mockedApiClient.createNutritionTargets.mockResolvedValue({ data: updatedTargets, error: null });
    const onTargetsRegenerated = jest.fn();

    const { getByTestId, getByText } = render(
      <NutritionTargetsScreen client={fakeClient} userId="user-1" onTargetsRegenerated={onTargetsRegenerated} />,
    );
    await waitFor(() => expect(getByTestId('nutrition-regenerate-button')).toBeTruthy());
    fireEvent.press(getByTestId('nutrition-regenerate-button'));
    await waitFor(() => expect(getByTestId('regenerate-accept')).toBeTruthy());

    fireEvent.press(getByTestId('regenerate-accept'));

    await waitFor(() =>
      expect(mockedApiClient.createNutritionTargets).toHaveBeenCalledWith(fakeClient, 'user-1', fakeCandidateTargets),
    );
    await waitFor(() => expect(getByText(/v2/)).toBeTruthy());
    expect(onTargetsRegenerated).toHaveBeenCalled();
  });

  test('declining the regeneration prompt makes no write call and leaves the displayed targets unchanged', async () => {
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: persistedTargets, error: null });
    mockedApiClient.buildNutritionRegenerationPreview.mockResolvedValue({
      data: { candidateTargets: fakeCandidateTargets, diffSummary: emptyNutritionDiff, currentTargets: persistedTargets },
      error: null,
    });

    const { getByTestId, getByText } = render(<NutritionTargetsScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('nutrition-regenerate-button')).toBeTruthy());
    fireEvent.press(getByTestId('nutrition-regenerate-button'));
    await waitFor(() => expect(getByTestId('regenerate-decline')).toBeTruthy());

    fireEvent.press(getByTestId('regenerate-decline'));

    await waitFor(() => expect(getByTestId('nutrition-targets-calories')).toBeTruthy());
    expect(mockedApiClient.createNutritionTargets).not.toHaveBeenCalled();
    expect(getByText(/v1/)).toBeTruthy();
  });

  test('SR-2: surfaces the unsafe-configuration warning banner when the preview candidate warrants one', async () => {
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: persistedTargets, error: null });
    mockedApiClient.buildNutritionRegenerationPreview.mockResolvedValue({
      data: {
        candidateTargets: { ...fakeCandidateTargets, unsafeConfigurationWarning: 'This configuration is risky.' },
        diffSummary: emptyNutritionDiff,
        currentTargets: persistedTargets,
      },
      error: null,
    });

    const { getByTestId } = render(<NutritionTargetsScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('nutrition-regenerate-button')).toBeTruthy());

    fireEvent.press(getByTestId('nutrition-regenerate-button'));

    await waitFor(() => expect(getByTestId('nutrition-unsafe-warning')).toBeTruthy());
  });
});
