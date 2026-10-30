import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import AuthNavigator from './AuthNavigator';

jest.mock('api-client', () => ({
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
  requestPasswordReset: jest.fn(),
  updatePassword: jest.fn(),
}));
jest.mock('../lib/oauthFlow', () => ({ performOAuthSignIn: jest.fn() }));
jest.mock('../lib/authRedirect', () => ({ getAuthRedirectUrl: jest.fn(() => 'https://example.com') }));

const fakeClient = {} as never;

function renderAuthNavigator() {
  return render(
    <NavigationContainer>
      <AuthNavigator client={fakeClient} />
    </NavigationContainer>,
  );
}

describe('AuthNavigator (FR-9.4)', () => {
  test('starts on SignIn', () => {
    const { getByTestId } = renderAuthNavigator();
    expect(getByTestId('signin-goto-signup')).toBeTruthy();
  });

  test('navigates from SignIn to SignUp and back', async () => {
    const { getByTestId } = renderAuthNavigator();

    fireEvent.press(getByTestId('signin-goto-signup'));
    await waitFor(() => expect(getByTestId('signup-goto-signin')).toBeTruthy());

    fireEvent.press(getByTestId('signup-goto-signin'));
    await waitFor(() => expect(getByTestId('signin-goto-signup')).toBeTruthy());
  });

  test('navigates from SignIn to ForgotPassword and back', async () => {
    const { getByTestId } = renderAuthNavigator();

    fireEvent.press(getByTestId('signin-goto-forgot-password'));
    await waitFor(() => expect(getByTestId('forgot-password-goto-signin')).toBeTruthy());

    fireEvent.press(getByTestId('forgot-password-goto-signin'));
    await waitFor(() => expect(getByTestId('signin-goto-signup')).toBeTruthy());
  });

  test('navigates from SignUp to PrivacyPolicy and back (PR-3)', async () => {
    const { getByTestId } = renderAuthNavigator();

    fireEvent.press(getByTestId('signin-goto-signup'));
    await waitFor(() => expect(getByTestId('signup-privacy-policy')).toBeTruthy());

    fireEvent.press(getByTestId('signup-privacy-policy'));
    await waitFor(() => expect(getByTestId('privacy-policy-close')).toBeTruthy());

    fireEvent.press(getByTestId('privacy-policy-close'));
    await waitFor(() => expect(getByTestId('signup-goto-signin')).toBeTruthy());
  });
});
