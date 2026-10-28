import * as apiClient from 'api-client';
import * as WebBrowser from 'expo-web-browser';

import { performOAuthSignIn } from './oauthFlow';

jest.mock('api-client', () => ({
  signInWithGoogle: jest.fn(),
  signInWithApple: jest.fn(),
  exchangeOAuthRedirectForSession: jest.fn(),
}));
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));
jest.mock('./authRedirect', () => ({
  getAuthRedirectUrl: () => 'gym://auth-callback',
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockedWebBrowser = WebBrowser as jest.Mocked<typeof WebBrowser>;

const fakeClient = {} as never;

describe('performOAuthSignIn', () => {
  afterEach(() => jest.clearAllMocks());

  test('completes the flow and exchanges the redirect for a session (google)', async () => {
    mockedApiClient.signInWithGoogle.mockResolvedValue({ url: 'https://auth/google', error: null });
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'gym://auth-callback?code=abc',
    } as never);
    mockedApiClient.exchangeOAuthRedirectForSession.mockResolvedValue({
      user: { id: 'u1' } as never,
      session: { access_token: 't' } as never,
      error: null,
    });

    const result = await performOAuthSignIn(fakeClient, 'google');

    expect(mockedApiClient.signInWithGoogle).toHaveBeenCalledWith(
      fakeClient,
      'gym://auth-callback',
    );
    expect(mockedWebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://auth/google',
      'gym://auth-callback',
    );
    expect(mockedApiClient.exchangeOAuthRedirectForSession).toHaveBeenCalledWith(
      fakeClient,
      'gym://auth-callback?code=abc',
    );
    expect(result.session).toEqual({ access_token: 't' });
  });

  test('uses the apple provider function for provider "apple"', async () => {
    mockedApiClient.signInWithApple.mockResolvedValue({ url: 'https://auth/apple', error: null });
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' } as never);

    await performOAuthSignIn(fakeClient, 'apple');

    expect(mockedApiClient.signInWithApple).toHaveBeenCalledWith(
      fakeClient,
      'gym://auth-callback',
    );
    expect(mockedApiClient.signInWithGoogle).not.toHaveBeenCalled();
  });

  test('returns an error if starting the flow fails', async () => {
    mockedApiClient.signInWithGoogle.mockResolvedValue({
      url: null,
      error: 'provider not configured',
    });

    const result = await performOAuthSignIn(fakeClient, 'google');

    expect(result.error).toBe('provider not configured');
    expect(mockedWebBrowser.openAuthSessionAsync).not.toHaveBeenCalled();
  });

  test('treats user cancellation as a non-error no-op', async () => {
    mockedApiClient.signInWithApple.mockResolvedValue({ url: 'https://auth/apple', error: null });
    mockedWebBrowser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' } as never);

    const result = await performOAuthSignIn(fakeClient, 'apple');

    expect(result.error).toBeNull();
    expect(result.session).toBeNull();
    expect(mockedApiClient.exchangeOAuthRedirectForSession).not.toHaveBeenCalled();
  });
});
