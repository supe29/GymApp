import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';
import { useState } from 'react';

import ProfileSetupFlow from '../profile/ProfileSetupFlow';
import NutritionTargetsScreen from './NutritionTargetsScreen';
import WorkoutPlanScreen from './WorkoutPlanScreen';

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

const equipmentItems = [
  { id: 'bw', key: 'bodyweight', display_name: 'Bodyweight', category: 'bodyweight_other', created_at: '' },
];

const generatedPlan = {
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
          exerciseName: 'Bodyweight Squat',
          orderIndex: 0,
          targetSets: 3,
          targetRepsMin: 10,
          targetRepsMax: 12,
          targetWeightKg: null,
          intensityNote: 'Comfortable resistance. (Generated from goal=general_fitness, level=beginner)',
        },
      ],
    },
  ],
};

const generatedNutritionTargets = {
  id: 'targets-1',
  dailyCalories: 2000,
  proteinG: 120,
  carbsG: 220,
  fatG: 56,
  targetVersion: 1,
  effectiveFrom: '2026-01-01T00:00:00Z',
  unsafeConfigurationWarning: null as string | null,
};

/**
 * The composition point AC-1 requires but that no phase before Phase 11
 * (real navigation) owns: wiring ProfileSetupFlow's onProfileCreated hook
 * to BOTH plan and nutrition-target generation, then showing the results.
 * This harness proves the capability works end-to-end; it is not itself a
 * product screen.
 */
function OnboardingToPlanHarness() {
  const [userId, setUserId] = useState<string | null>(null);

  async function handleProfileCreated(createdUserId: string) {
    await Promise.all([
      apiClient.generateInitialPlan(fakeClient, createdUserId),
      apiClient.generateInitialNutritionTargets(fakeClient, createdUserId),
    ]);
    setUserId(createdUserId);
  }

  if (userId) {
    return (
      <>
        <WorkoutPlanScreen client={fakeClient} userId={userId} />
        <NutritionTargetsScreen client={fakeClient} userId={userId} />
      </>
    );
  }

  return (
    <ProfileSetupFlow client={fakeClient} userId="user-1" onProfileCreated={handleProfileCreated} />
  );
}

async function fillOutAllStepsUpToDisclaimer(getByTestId: (id: string) => never) {
  fireEvent.changeText(getByTestId('onboarding-age'), '30');
  fireEvent.changeText(getByTestId('onboarding-height'), '175');
  fireEvent.changeText(getByTestId('onboarding-weight'), '75');
  fireEvent.press(getByTestId('onboarding-sex-prefer_not_to_say'));
  fireEvent.press(getByTestId('onboarding-next'));

  fireEvent.press(getByTestId('onboarding-fitness-beginner'));
  fireEvent.press(getByTestId('onboarding-next'));

  fireEvent.press(getByTestId('onboarding-goal-general_fitness'));
  fireEvent.press(getByTestId('onboarding-next'));

  fireEvent.press(getByTestId('onboarding-training-days-3'));
  fireEvent.press(getByTestId('onboarding-next'));

  fireEvent.press(getByTestId('onboarding-next'));
}

describe('onboarding -> plan + nutrition generation (AC-1)', () => {
  afterEach(() => jest.clearAllMocks());

  test('completing onboarding generates and displays both a workout plan and nutrition targets, with no further input', async () => {
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: equipmentItems as never, error: null });
    mockedApiClient.createProfile.mockResolvedValue({ data: {} as never, error: null });
    mockedApiClient.setUserEquipment.mockResolvedValue({ error: null });
    mockedApiClient.generateInitialPlan.mockResolvedValue({ data: generatedPlan, error: null });
    mockedApiClient.getCurrentPlan.mockResolvedValue({ data: generatedPlan, error: null });
    mockedApiClient.generateInitialNutritionTargets.mockResolvedValue({ data: generatedNutritionTargets, error: null });
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: generatedNutritionTargets, error: null });

    const { getByTestId } = render(<OnboardingToPlanHarness />);
    await waitFor(() => expect(mockedApiClient.listEquipmentItems).toHaveBeenCalled());

    await fillOutAllStepsUpToDisclaimer(getByTestId as never);
    fireEvent.press(getByTestId('disclaimer-checkbox'));
    fireEvent.press(getByTestId('disclaimer-continue'));

    // No further simulated input beyond the onboarding steps themselves.
    await waitFor(() => expect(getByTestId('plan-session-1')).toBeTruthy());
    expect(mockedApiClient.generateInitialPlan).toHaveBeenCalledWith(fakeClient, 'user-1');
    expect(getByTestId('plan-exercise-ex-1')).toBeTruthy();

    await waitFor(() => expect(getByTestId('nutrition-targets-calories')).toBeTruthy());
    expect(mockedApiClient.generateInitialNutritionTargets).toHaveBeenCalledWith(fakeClient, 'user-1');
    expect(getByTestId('nutrition-targets-protein')).toBeTruthy();
  });
});
