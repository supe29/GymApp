import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import { performOAuthSignIn } from '../../lib/oauthFlow';
import SignInScreen from './SignInScreen';

jest.mock('api-client', () => ({
  signInWithEmail: jest.fn(),
}));
jest.mock('../../lib/oauthFlow', () => ({
  performOAuthSignIn: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockedOAuth = performOAuthSignIn as jest.Mock;
const fakeClient = {} as never;

describe('SignInScreen (FR-9.1)', () => {
  afterEach(() => jest.clearAllMocks());

  test('signs in with email/password and calls onSignedIn on success', async () => {
    mockedApiClient.signInWithEmail.mockResolvedValue({
      user: { id: 'u1' } as never,
      session: { access_token: 't' } as never,
      error: null,
    });
    const onSignedIn = jest.fn();
    const { getByTestId } = render(<SignInScreen client={fakeClient} onSignedIn={onSignedIn} />);

    fireEvent.changeText(getByTestId('signin-email'), 'a@example.com');
    fireEvent.changeText(getByTestId('signin-password'), 'hunter2');
    fireEvent.press(getByTestId('signin-submit'));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(mockedApiClient.signInWithEmail).toHaveBeenCalledWith(
      fakeClient,
      'a@example.com',
      'hunter2',
    );
  });

  test('shows the server error message on failure and does not sign in', async () => {
    mockedApiClient.signInWithEmail.mockResolvedValue({
      user: null,
      session: null,
      error: 'Invalid login credentials',
    });
    const onSignedIn = jest.fn();
    const { getByTestId } = render(<SignInScreen client={fakeClient} onSignedIn={onSignedIn} />);

    fireEvent.changeText(getByTestId('signin-email'), 'a@example.com');
    fireEvent.changeText(getByTestId('signin-password'), 'wrong');
    fireEvent.press(getByTestId('signin-submit'));

    await waitFor(() =>
      expect(getByTestId('signin-error').props.children).toBe('Invalid login credentials'),
    );
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  test('Google sign-in calls onSignedIn on success', async () => {
    mockedOAuth.mockResolvedValue({
      user: { id: 'u1' } as never,
      session: { access_token: 't' } as never,
      error: null,
    });
    const onSignedIn = jest.fn();
    const { getByTestId } = render(<SignInScreen client={fakeClient} onSignedIn={onSignedIn} />);

    fireEvent.press(getByTestId('signin-google'));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(mockedOAuth).toHaveBeenCalledWith(fakeClient, 'google');
  });

  test('navigates to forgot password and to sign up', () => {
    const onNavigateToForgotPassword = jest.fn();
    const onNavigateToSignUp = jest.fn();
    const { getByTestId } = render(
      <SignInScreen
        client={fakeClient}
        onNavigateToForgotPassword={onNavigateToForgotPassword}
        onNavigateToSignUp={onNavigateToSignUp}
      />,
    );

    fireEvent.press(getByTestId('signin-goto-forgot-password'));
    fireEvent.press(getByTestId('signin-goto-signup'));

    expect(onNavigateToForgotPassword).toHaveBeenCalled();
    expect(onNavigateToSignUp).toHaveBeenCalled();
  });
});
