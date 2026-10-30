import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import OnboardingFlow from './OnboardingFlow';

jest.mock('api-client', () => ({
  createProfile: jest.fn(),
  setUserEquipment: jest.fn(),
  listEquipmentItems: jest.fn(),
  getCurrentPlan: jest.fn(),
  generateInitialPlan: jest.fn(),
  buildRegenerationPreview: jest.fn(),
  createWorkoutPlan: jest.fn(),
  getCurrentNutritionTargets: jest.fn(),
  generateInitialNutritionTargets: jest.fn(),
  buildNutritionRegenerationPreview: jest.fn(),
  createNutritionTargets: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

async function fillBasicInfoAndAdvanceThroughDisclaimer(getByTestId: (id: string) => { props: unknown }) {
  fireEvent.changeText(getByTestId('onboarding-age'), '30');
  fireEvent.changeText(getByTestId('onboarding-height'), '175');
  fireEvent.changeText(getByTestId('onboarding-weight'), '75');
  fireEvent.press(getByTestId('onboarding-next')); // -> fitness level
  fireEvent.press(getByTestId('onboarding-next')); // -> goal
  fireEvent.press(getByTestId('onboarding-next')); // -> training days
  fireEvent.press(getByTestId('onboarding-training-days-3'));
  fireEvent.press(getByTestId('onboarding-next')); // -> equipment
  fireEvent.press(getByTestId('onboarding-next')); // -> disclaimer
  fireEvent.press(getByTestId('disclaimer-checkbox'));
  fireEvent.press(getByTestId('disclaimer-continue'));
}

describe('OnboardingFlow (UX-1, spec §2.1)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('advances through profile → plan → targets and calls onComplete', async () => {
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
    mockedApiClient.createProfile.mockResolvedValue({ data: { user_id: 'user-1' } as never, error: null });
    mockedApiClient.setUserEquipment.mockResolvedValue({ error: null });

    mockedApiClient.getCurrentPlan.mockResolvedValue({ data: null, error: null });
    mockedApiClient.generateInitialPlan.mockResolvedValue({
      data: { id: 'plan-1', splitType: 'full_body', planVersion: 1, effectiveFrom: '', sessions: [] },
      error: null,
    });

    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: null, error: null });
    mockedApiClient.generateInitialNutritionTargets.mockResolvedValue({
      data: { id: 'targets-1', dailyCalories: 2000, proteinG: 150, carbsG: 200, fatG: 60, targetVersion: 1, effectiveFrom: '', unsafeConfigurationWarning: null },
      error: null,
    });

    const onComplete = jest.fn();
    const { getByTestId } = render(<OnboardingFlow client={fakeClient} userId="user-1" onComplete={onComplete} />);
    await waitFor(() => expect(mockedApiClient.listEquipmentItems).toHaveBeenCalled());

    // Step 1: profile (ending in the disclaimer, already internal to ProfileSetupFlow).
    await fillBasicInfoAndAdvanceThroughDisclaimer(getByTestId);
    await waitFor(() => expect(mockedApiClient.createProfile).toHaveBeenCalled());

    // Step 2: plan — empty state, generate the initial plan.
    await waitFor(() => expect(getByTestId('plan-generate-button')).toBeTruthy());
    fireEvent.press(getByTestId('plan-generate-button'));
    await waitFor(() => expect(mockedApiClient.generateInitialPlan).toHaveBeenCalled());

    // Step 3: targets — empty state, generate initial targets, which completes the flow.
    await waitFor(() => expect(getByTestId('nutrition-generate-button')).toBeTruthy());
    fireEvent.press(getByTestId('nutrition-generate-button'));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});
