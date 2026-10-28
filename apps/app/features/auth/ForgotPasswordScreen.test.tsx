import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import ForgotPasswordScreen from './ForgotPasswordScreen';

jest.mock('api-client', () => ({
  requestPasswordReset: jest.fn(),
}));
jest.mock('../../lib/authRedirect', () => ({
  getAuthRedirectUrl: () => 'gym://reset',
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

describe('ForgotPasswordScreen (FR-9.2)', () => {
  afterEach(() => jest.clearAllMocks());

  test('requests a reset link and shows the confirmation state', async () => {
    mockedApiClient.requestPasswordReset.mockResolvedValue({ error: null });
    const { getByTestId } = render(<ForgotPasswordScreen client={fakeClient} />);

    fireEvent.changeText(getByTestId('forgot-password-email'), 'a@example.com');
    fireEvent.press(getByTestId('forgot-password-submit'));

    await waitFor(() => expect(getByTestId('forgot-password-sent')).toBeTruthy());
    expect(mockedApiClient.requestPasswordReset).toHaveBeenCalledWith(
      fakeClient,
      'a@example.com',
      'gym://reset',
    );
  });

  test('shows a validation error when the email is empty', async () => {
    const { getByTestId, queryByTestId } = render(<ForgotPasswordScreen client={fakeClient} />);

    fireEvent.press(getByTestId('forgot-password-submit'));

    await waitFor(() => expect(queryByTestId('forgot-password-error')).toBeTruthy());
    expect(mockedApiClient.requestPasswordReset).not.toHaveBeenCalled();
  });

  test('shows the server error and does not switch to the confirmation state', async () => {
    mockedApiClient.requestPasswordReset.mockResolvedValue({ error: 'Rate limited' });
    const { getByTestId, queryByTestId } = render(<ForgotPasswordScreen client={fakeClient} />);

    fireEvent.changeText(getByTestId('forgot-password-email'), 'a@example.com');
    fireEvent.press(getByTestId('forgot-password-submit'));

    await waitFor(() =>
      expect(getByTestId('forgot-password-error').props.children).toBe('Rate limited'),
    );
    expect(queryByTestId('forgot-password-sent')).toBeNull();
  });

  test('navigates back to sign-in', () => {
    const onNavigateToSignIn = jest.fn();
    const { getByTestId } = render(
      <ForgotPasswordScreen client={fakeClient} onNavigateToSignIn={onNavigateToSignIn} />,
    );

    fireEvent.press(getByTestId('forgot-password-goto-signin'));

    expect(onNavigateToSignIn).toHaveBeenCalled();
  });
});
