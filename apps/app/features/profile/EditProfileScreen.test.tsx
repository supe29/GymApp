import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import EditProfileScreen from './EditProfileScreen';

jest.mock('api-client', () => ({
  getProfile: jest.fn(),
  getUserEquipmentIds: jest.fn(),
  listEquipmentItems: jest.fn(),
  updateProfile: jest.fn(),
  setUserEquipment: jest.fn(),
  requestAccountDeletion: jest.fn(),
  buildRegenerationPreview: jest.fn(),
  createWorkoutPlan: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

const baseProfile = {
  user_id: 'user-1',
  age: 30,
  height_cm: 175,
  weight_kg: 75,
  biological_sex: 'prefer_not_to_say',
  fitness_level: 'beginner',
  goal: 'general_fitness',
  training_days_per_week: 3,
  unit_preference: 'metric',
  created_at: '',
  updated_at: '',
};

const fakeCandidatePlan = {
  splitType: 'full_body' as const,
  splitRuleId: 'split-02',
  sessions: [],
  inputsSnapshot: {
    goal: 'fat_loss' as const,
    fitnessLevel: 'beginner' as const,
    trainingDaysPerWeek: 3,
    availableEquipmentKeys: [],
  },
};

const emptyDiffSummary = {
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

const fakeRegenerationPreview = {
  candidatePlan: fakeCandidatePlan,
  diffSummary: emptyDiffSummary,
  currentPlan: null,
};

async function renderLoaded() {
  mockedApiClient.getProfile.mockResolvedValue({ data: baseProfile as never, error: null });
  mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
  mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
  mockedApiClient.updateProfile.mockResolvedValue({ data: baseProfile as never, error: null });
  mockedApiClient.setUserEquipment.mockResolvedValue({ error: null });
  mockedApiClient.buildRegenerationPreview.mockResolvedValue({ data: fakeRegenerationPreview, error: null });
  mockedApiClient.createWorkoutPlan.mockResolvedValue({ data: null as never, error: null });

  const utils = render(<EditProfileScreen client={fakeClient} userId="user-1" />);
  await waitFor(() => expect(utils.queryByTestId('edit-profile-loading')).toBeNull());
  return utils;
}

describe('EditProfileScreen (FR-1.3/FR-1.4/AC-3)', () => {
  afterEach(() => jest.clearAllMocks());

  test('saving without changing a plan-affecting field calls onSaved directly, without a regenerate prompt', async () => {
    const onSaved = jest.fn();
    const onRegenerateRequested = jest.fn();
    mockedApiClient.getProfile.mockResolvedValue({ data: baseProfile as never, error: null });
    mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
    mockedApiClient.updateProfile.mockResolvedValue({ data: baseProfile as never, error: null });
    mockedApiClient.setUserEquipment.mockResolvedValue({ error: null });

    const { getByTestId, queryByTestId } = render(
      <EditProfileScreen
        client={fakeClient}
        userId="user-1"
        onSaved={onSaved}
        onRegenerateRequested={onRegenerateRequested}
      />,
    );
    await waitFor(() => expect(queryByTestId('edit-profile-loading')).toBeNull());

    // Change only age, which is not plan-affecting.
    fireEvent.changeText(getByTestId('edit-profile-age'), '31');
    fireEvent.press(getByTestId('edit-profile-save'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockedApiClient.updateProfile).toHaveBeenCalledWith(
      fakeClient,
      'user-1',
      expect.objectContaining({ age: 31 }),
    );
    expect(onRegenerateRequested).not.toHaveBeenCalled();
    expect(queryByTestId('regenerate-accept')).toBeNull();
  });

  test('changing a plan-affecting field (goal) surfaces the regenerate prompt', async () => {
    const { getByTestId } = await renderLoaded();

    fireEvent.press(getByTestId('edit-profile-goal-fat_loss'));
    fireEvent.press(getByTestId('edit-profile-save'));

    await waitFor(() => expect(getByTestId('regenerate-accept')).toBeTruthy());
    // The profile field change itself is persisted immediately (AC-3 is
    // about the plan/targets, not the profile row).
    expect(mockedApiClient.updateProfile).toHaveBeenCalledWith(
      fakeClient,
      'user-1',
      expect.objectContaining({ goal: 'fat_loss' }),
    );
  });

  test('AC-3: declining the regenerate prompt does not call onRegenerateRequested', async () => {
    const onRegenerateRequested = jest.fn();
    const onSaved = jest.fn();
    mockedApiClient.getProfile.mockResolvedValue({ data: baseProfile as never, error: null });
    mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
    mockedApiClient.updateProfile.mockResolvedValue({ data: baseProfile as never, error: null });
    mockedApiClient.setUserEquipment.mockResolvedValue({ error: null });
    mockedApiClient.buildRegenerationPreview.mockResolvedValue({ data: fakeRegenerationPreview, error: null });

    const { getByTestId } = render(
      <EditProfileScreen
        client={fakeClient}
        userId="user-1"
        onSaved={onSaved}
        onRegenerateRequested={onRegenerateRequested}
      />,
    );
    await waitFor(() => expect(mockedApiClient.getProfile).toHaveBeenCalled());

    fireEvent.press(getByTestId('edit-profile-goal-fat_loss'));
    fireEvent.press(getByTestId('edit-profile-save'));
    await waitFor(() => expect(getByTestId('regenerate-decline')).toBeTruthy());

    fireEvent.press(getByTestId('regenerate-decline'));

    expect(onRegenerateRequested).not.toHaveBeenCalled();
    expect(mockedApiClient.createWorkoutPlan).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  test('accepting the regenerate prompt persists the plan, then calls onRegenerateRequested, then onSaved, in order', async () => {
    const callOrder: string[] = [];
    const onRegenerateRequested = jest.fn(() => callOrder.push('onRegenerateRequested'));
    const onSaved = jest.fn(() => callOrder.push('onSaved'));
    mockedApiClient.getProfile.mockResolvedValue({ data: baseProfile as never, error: null });
    mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });
    mockedApiClient.updateProfile.mockResolvedValue({ data: baseProfile as never, error: null });
    mockedApiClient.setUserEquipment.mockResolvedValue({ error: null });
    mockedApiClient.buildRegenerationPreview.mockResolvedValue({ data: fakeRegenerationPreview, error: null });
    mockedApiClient.createWorkoutPlan.mockImplementation(async () => {
      callOrder.push('createWorkoutPlan');
      return { data: null as never, error: null };
    });

    const { getByTestId } = render(
      <EditProfileScreen
        client={fakeClient}
        userId="user-1"
        onSaved={onSaved}
        onRegenerateRequested={onRegenerateRequested}
      />,
    );
    await waitFor(() => expect(mockedApiClient.getProfile).toHaveBeenCalled());

    fireEvent.press(getByTestId('edit-profile-training-days-5'));
    fireEvent.press(getByTestId('edit-profile-save'));
    await waitFor(() => expect(getByTestId('regenerate-accept')).toBeTruthy());

    fireEvent.press(getByTestId('regenerate-accept'));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockedApiClient.createWorkoutPlan).toHaveBeenCalledWith(
      fakeClient,
      'user-1',
      fakeRegenerationPreview.candidatePlan,
    );
    expect(callOrder).toEqual(['createWorkoutPlan', 'onRegenerateRequested', 'onSaved']);
    expect(mockedApiClient.updateProfile).toHaveBeenCalledWith(
      fakeClient,
      'user-1',
      expect.objectContaining({ training_days_per_week: 5 }),
    );
  });

  test('a validation error blocks saving and no API calls are made', async () => {
    const { getByTestId, queryByTestId } = await renderLoaded();

    fireEvent.changeText(getByTestId('edit-profile-age'), '5');
    fireEvent.press(getByTestId('edit-profile-save'));

    await waitFor(() => expect(queryByTestId('edit-profile-error')).toBeTruthy());
    expect(mockedApiClient.updateProfile).not.toHaveBeenCalled();
  });
});

describe('EditProfileScreen account deletion (FR-9.3)', () => {
  afterEach(() => jest.clearAllMocks());

  test('requires confirmation before requesting deletion', async () => {
    const { getByTestId, queryByTestId } = await renderLoaded();

    expect(queryByTestId('delete-account-confirm')).toBeNull();

    fireEvent.press(getByTestId('edit-profile-delete-account'));

    expect(getByTestId('delete-account-confirm')).toBeTruthy();
    expect(mockedApiClient.requestAccountDeletion).not.toHaveBeenCalled();
  });

  test('confirming calls requestAccountDeletion and onAccountDeleted', async () => {
    mockedApiClient.requestAccountDeletion.mockResolvedValue({ error: null });
    const onAccountDeleted = jest.fn();
    mockedApiClient.getProfile.mockResolvedValue({ data: baseProfile as never, error: null });
    mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });

    const { getByTestId } = render(
      <EditProfileScreen client={fakeClient} userId="user-1" onAccountDeleted={onAccountDeleted} />,
    );
    await waitFor(() => expect(mockedApiClient.getProfile).toHaveBeenCalled());

    fireEvent.press(getByTestId('edit-profile-delete-account'));
    fireEvent.press(getByTestId('delete-account-confirm'));

    await waitFor(() => expect(onAccountDeleted).toHaveBeenCalled());
    expect(mockedApiClient.requestAccountDeletion).toHaveBeenCalledWith(fakeClient);
  });

  test('cancelling does not call requestAccountDeletion', async () => {
    const { getByTestId, queryByTestId } = await renderLoaded();

    fireEvent.press(getByTestId('edit-profile-delete-account'));
    fireEvent.press(getByTestId('delete-account-cancel'));

    expect(queryByTestId('delete-account-confirm')).toBeNull();
    expect(mockedApiClient.requestAccountDeletion).not.toHaveBeenCalled();
  });

  test('shows a server error without calling onAccountDeleted', async () => {
    mockedApiClient.requestAccountDeletion.mockResolvedValue({ error: 'server unavailable' });
    const onAccountDeleted = jest.fn();
    mockedApiClient.getProfile.mockResolvedValue({ data: baseProfile as never, error: null });
    mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });

    const { getByTestId } = render(
      <EditProfileScreen client={fakeClient} userId="user-1" onAccountDeleted={onAccountDeleted} />,
    );
    await waitFor(() => expect(mockedApiClient.getProfile).toHaveBeenCalled());

    fireEvent.press(getByTestId('edit-profile-delete-account'));
    fireEvent.press(getByTestId('delete-account-confirm'));

    await waitFor(() =>
      expect(getByTestId('delete-account-error').props.children).toBe('server unavailable'),
    );
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });
});
