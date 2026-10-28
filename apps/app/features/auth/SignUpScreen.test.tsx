import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import { performOAuthSignIn } from '../../lib/oauthFlow';
import SignUpScreen from './SignUpScreen';

jest.mock('api-client', () => ({
  signUpWithEmail: jest.fn(),
}));
jest.mock('../../lib/oauthFlow', () => ({
  performOAuthSignIn: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockedOAuth = performOAuthSignIn as jest.Mock;
const fakeClient = {} as never;

describe('SignUpScreen (FR-9.1)', () => {
  afterEach(() => jest.clearAllMocks());

  test('signs up with email/password and calls onSignedUp on success', async () => {
    mockedApiClient.signUpWithEmail.mockResolvedValue({
      user: { id: 'u1' } as never,
      session: { access_token: 't' } as never,
      error: null,
    });
    const onSignedUp = jest.fn();
    const { getByTestId } = await render(
      <SignUpScreen client={fakeClient} onSignedUp={onSignedUp} />,
    );

    fireEvent.changeText(getByTestId('signup-email'), 'a@example.com');
    fireEvent.changeText(getByTestId('signup-password'), 'hunter2');
    fireEvent.press(getByTestId('signup-submit'));

    await waitFor(() => expect(onSignedUp).toHaveBeenCalled());
    expect(mockedApiClient.signUpWithEmail).toHaveBeenCalledWith(
      fakeClient,
      'a@example.com',
      'hunter2',
    );
  });

  test('shows a validation error and does not call the API when fields are empty', async () => {
    const { getByTestId, queryByTestId } = await render(<SignUpScreen client={fakeClient} />);

    fireEvent.press(getByTestId('signup-submit'));

    await waitFor(() => expect(queryByTestId('signup-error')).toBeTruthy());
    expect(mockedApiClient.signUpWithEmail).not.toHaveBeenCalled();
  });

  test('shows the server error message on failure', async () => {
    mockedApiClient.signUpWithEmail.mockResolvedValue({
      user: null,
      session: null,
      error: 'Email already registered',
    });
    const onSignedUp = jest.fn();
    const { getByTestId } = await render(
      <SignUpScreen client={fakeClient} onSignedUp={onSignedUp} />,
    );

    fireEvent.changeText(getByTestId('signup-email'), 'a@example.com');
    fireEvent.changeText(getByTestId('signup-password'), 'hunter2');
    fireEvent.press(getByTestId('signup-submit'));

    await waitFor(() =>
      expect(getByTestId('signup-error').props.children).toBe('Email already registered'),
    );
    expect(onSignedUp).not.toHaveBeenCalled();
  });

  test('Google button starts the OAuth flow and calls onSignedUp on success', async () => {
    mockedOAuth.mockResolvedValue({
      user: { id: 'u1' } as never,
      session: { access_token: 't' } as never,
      error: null,
    });
    const onSignedUp = jest.fn();
    const { getByTestId } = await render(
      <SignUpScreen client={fakeClient} onSignedUp={onSignedUp} />,
    );

    fireEvent.press(getByTestId('signup-google'));

    await waitFor(() => expect(onSignedUp).toHaveBeenCalled());
    expect(mockedOAuth).toHaveBeenCalledWith(fakeClient, 'google');
  });

  test('Apple button starts the OAuth flow with provider "apple"', async () => {
    mockedOAuth.mockResolvedValue({ user: null, session: null, error: null });
    const { getByTestId } = await render(<SignUpScreen client={fakeClient} />);

    fireEvent.press(getByTestId('signup-apple'));

    await waitFor(() => expect(mockedOAuth).toHaveBeenCalledWith(fakeClient, 'apple'));
  });

  test('cancelled OAuth (no error, no session) does not call onSignedUp', async () => {
    mockedOAuth.mockResolvedValue({ user: null, session: null, error: null });
    const onSignedUp = jest.fn();
    const { getByTestId } = await render(
      <SignUpScreen client={fakeClient} onSignedUp={onSignedUp} />,
    );

    fireEvent.press(getByTestId('signup-google'));

    await waitFor(() => expect(mockedOAuth).toHaveBeenCalled());
    expect(onSignedUp).not.toHaveBeenCalled();
  });

  test('navigates to sign-in', async () => {
    const onNavigateToSignIn = jest.fn();
    const { getByTestId } = await render(
      <SignUpScreen client={fakeClient} onNavigateToSignIn={onNavigateToSignIn} />,
    );

    fireEvent.press(getByTestId('signup-goto-signin'));

    expect(onNavigateToSignIn).toHaveBeenCalled();
  });
});
