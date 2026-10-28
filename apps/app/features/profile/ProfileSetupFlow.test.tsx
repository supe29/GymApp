import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import ProfileSetupFlow from './ProfileSetupFlow';

jest.mock('api-client', () => ({
  createProfile: jest.fn(),
  setUserEquipment: jest.fn(),
  listEquipmentItems: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

const equipmentItems = [
  { id: 'bw', key: 'bodyweight', display_name: 'Bodyweight', category: 'bodyweight_other', created_at: '' },
];

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

  // Equipment step: leave as-is (empty selection is valid), advance.
  fireEvent.press(getByTestId('onboarding-next'));
}

describe('ProfileSetupFlow (FR-1.1/FR-1.2/SR-5/AC-14)', () => {
  beforeEach(() => {
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: equipmentItems as never, error: null });
  });
  afterEach(() => jest.clearAllMocks());

  test('AC-14: profile is not created before the disclaimer step is reached and acknowledged', async () => {
    mockedApiClient.createProfile.mockResolvedValue({ data: {} as never, error: null });
    mockedApiClient.setUserEquipment.mockResolvedValue({ error: null });
    const onComplete = jest.fn();

    const { getByTestId, queryByTestId } = render(
      <ProfileSetupFlow client={fakeClient} userId="user-1" onComplete={onComplete} />,
    );

    await waitFor(() => expect(mockedApiClient.listEquipmentItems).toHaveBeenCalled());

    // Advance through every step except the final disclaimer acknowledgment.
    await fillOutAllStepsUpToDisclaimer(getByTestId as never);

    // Now on the disclaimer step; profile must not exist yet.
    expect(mockedApiClient.createProfile).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(queryByTestId('disclaimer-continue')).toBeTruthy();

    // Pressing continue before checking the disclaimer box must not complete onboarding.
    fireEvent.press(getByTestId('disclaimer-continue'));
    expect(mockedApiClient.createProfile).not.toHaveBeenCalled();

    // Checking the box and continuing completes onboarding.
    fireEvent.press(getByTestId('disclaimer-checkbox'));
    fireEvent.press(getByTestId('disclaimer-continue'));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(mockedApiClient.createProfile).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({
        user_id: 'user-1',
        age: 30,
        height_cm: 175,
        weight_kg: 75,
        biological_sex: 'prefer_not_to_say',
        fitness_level: 'beginner',
        goal: 'general_fitness',
        training_days_per_week: 3,
      }),
    );
    expect(mockedApiClient.setUserEquipment).toHaveBeenCalledWith(fakeClient, 'user-1', []);
  });

  test('AC-1: onProfileCreated fires with the new user id once the profile is persisted', async () => {
    mockedApiClient.createProfile.mockResolvedValue({ data: {} as never, error: null });
    mockedApiClient.setUserEquipment.mockResolvedValue({ error: null });
    const onComplete = jest.fn();
    const onProfileCreated = jest.fn();

    const { getByTestId } = render(
      <ProfileSetupFlow
        client={fakeClient}
        userId="user-1"
        onComplete={onComplete}
        onProfileCreated={onProfileCreated}
      />,
    );
    await waitFor(() => expect(mockedApiClient.listEquipmentItems).toHaveBeenCalled());
    await fillOutAllStepsUpToDisclaimer(getByTestId as never);

    fireEvent.press(getByTestId('disclaimer-checkbox'));
    fireEvent.press(getByTestId('disclaimer-continue'));

    await waitFor(() => expect(onProfileCreated).toHaveBeenCalledWith('user-1'));
    expect(onComplete).toHaveBeenCalled();
  });

  test('an invalid draft (e.g. missing age) is rejected before calling createProfile', async () => {
    mockedApiClient.createProfile.mockResolvedValue({ data: {} as never, error: null });
    const { getByTestId } = render(<ProfileSetupFlow client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(mockedApiClient.listEquipmentItems).toHaveBeenCalled());

    // Skip filling in age/height/weight/sex entirely; just advance through all steps.
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.press(getByTestId('onboarding-fitness-beginner'));
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.press(getByTestId('onboarding-goal-general_fitness'));
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.press(getByTestId('onboarding-training-days-3'));
    fireEvent.press(getByTestId('onboarding-next'));
    fireEvent.press(getByTestId('onboarding-next'));

    fireEvent.press(getByTestId('disclaimer-checkbox'));
    fireEvent.press(getByTestId('disclaimer-continue'));

    await waitFor(() => expect(getByTestId('onboarding-error')).toBeTruthy());
    expect(mockedApiClient.createProfile).not.toHaveBeenCalled();
  });

  test('surfaces a server error from createProfile without calling onComplete', async () => {
    mockedApiClient.createProfile.mockResolvedValue({ data: null, error: 'insert failed' });
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <ProfileSetupFlow client={fakeClient} userId="user-1" onComplete={onComplete} />,
    );

    await waitFor(() => expect(mockedApiClient.listEquipmentItems).toHaveBeenCalled());
    await fillOutAllStepsUpToDisclaimer(getByTestId as never);

    fireEvent.press(getByTestId('disclaimer-checkbox'));
    fireEvent.press(getByTestId('disclaimer-continue'));

    await waitFor(() => expect(getByTestId('onboarding-error').props.children).toBe('insert failed'));
    expect(onComplete).not.toHaveBeenCalled();
  });

  test('Back navigates to the previous step', async () => {
    const { getByTestId, getByTestId: get } = render(
      <ProfileSetupFlow client={fakeClient} userId="user-1" />,
    );
    await waitFor(() => expect(mockedApiClient.listEquipmentItems).toHaveBeenCalled());

    fireEvent.press(getByTestId('onboarding-next'));
    expect(get('onboarding-progress-text').props.children.join('')).toContain('Fitness level');

    fireEvent.press(getByTestId('onboarding-back'));
    expect(get('onboarding-progress-text').props.children.join('')).toContain('Basic info');
  });
});
