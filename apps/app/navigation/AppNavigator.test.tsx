import { render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import AppNavigator from './AppNavigator';

jest.mock('three-model', () => {
  const react = jest.requireActual('react');
  return { BodyModel: react.forwardRef(() => null) };
});

jest.mock('api-client', () => ({
  createGymClient: jest.fn(() => ({})),
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(() => ({ unsubscribe: jest.fn() })),
  getProfile: jest.fn(),
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  requestPasswordReset: jest.fn(),
  updatePassword: jest.fn(),
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
  getWorkoutSessionHistory: jest.fn(),
  getFoodLogEntriesForDate: jest.fn(),
  getPersonalRecordsForUser: jest.fn(),
  getPendingProgressionSuggestions: jest.fn(),
  updateProgressionSuggestionStatus: jest.fn(),
  getWeightEntries: jest.fn(),
  getUserEquipmentIds: jest.fn(),
  updateProfile: jest.fn(),
  requestAccountDeletion: jest.fn(),
}));
jest.mock('../lib/oauthFlow', () => ({ performOAuthSignIn: jest.fn() }));
jest.mock('../lib/authRedirect', () => ({ getAuthRedirectUrl: jest.fn(() => 'https://example.com') }));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('AppNavigator (FR-9.4)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('renders the sign-in screen when there is no session', async () => {
    mockedApiClient.getSession.mockResolvedValue(null);

    const { getByTestId } = render(<AppNavigator />);

    await waitFor(() => expect(getByTestId('signin-goto-signup')).toBeTruthy());
  });

  test('routes to OnboardingFlow when signed in with no profile yet', async () => {
    mockedApiClient.getSession.mockResolvedValue({ user: { id: 'user-1' } } as never);
    mockedApiClient.getProfile.mockResolvedValue({ data: null, error: null });
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });

    const { getByTestId } = render(<AppNavigator />);

    await waitFor(() => expect(getByTestId('onboarding-age')).toBeTruthy());
  });

  test('routes to MainTabs when signed in with an existing profile', async () => {
    mockedApiClient.getSession.mockResolvedValue({ user: { id: 'user-1' } } as never);
    mockedApiClient.getProfile.mockResolvedValue({
      data: { user_id: 'user-1', unit_preference: 'metric' } as never,
      error: null,
    });
    mockedApiClient.getCurrentPlan.mockResolvedValue({ data: null, error: null });
    mockedApiClient.getWorkoutSessionHistory.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: null, error: null });
    mockedApiClient.getFoodLogEntriesForDate.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getPersonalRecordsForUser.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getPendingProgressionSuggestions.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getWeightEntries.mockResolvedValue({ data: [], error: null });

    const { getByTestId } = render(<AppNavigator />);

    await waitFor(() => expect(getByTestId('dashboard-screen')).toBeTruthy());
  });
});
