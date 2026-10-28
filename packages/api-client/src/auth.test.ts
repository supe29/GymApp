import {
  exchangeOAuthRedirectForSession,
  getSession,
  onAuthStateChange,
  requestPasswordReset,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  updatePassword,
} from './auth';
import { createMockClient } from './testSupport/mockClient';

const fakeUser = { id: 'user-1' } as never;
const fakeSession = { access_token: 'token' } as never;

describe('signUpWithEmail (FR-9.1)', () => {
  test('returns user/session on success', async () => {
    const { client, auth } = createMockClient();
    auth.signUp.mockResolvedValue({ data: { user: fakeUser, session: fakeSession }, error: null });

    const result = await signUpWithEmail(client, 'a@example.com', 'hunter2');

    expect(auth.signUp).toHaveBeenCalledWith({ email: 'a@example.com', password: 'hunter2' });
    expect(result).toEqual({ user: fakeUser, session: fakeSession, error: null });
  });

  test('surfaces the error message on failure', async () => {
    const { client, auth } = createMockClient();
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Email already registered' },
    });

    const result = await signUpWithEmail(client, 'a@example.com', 'hunter2');

    expect(result.error).toBe('Email already registered');
    expect(result.user).toBeNull();
  });
});

describe('signInWithEmail (FR-9.1)', () => {
  test('calls signInWithPassword with the given credentials', async () => {
    const { client, auth } = createMockClient();
    auth.signInWithPassword.mockResolvedValue({
      data: { user: fakeUser, session: fakeSession },
      error: null,
    });

    const result = await signInWithEmail(client, 'a@example.com', 'hunter2');

    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'hunter2',
    });
    expect(result.session).toBe(fakeSession);
  });
});

describe('OAuth sign-in (FR-9.1: Google and Apple)', () => {
  test('signInWithGoogle starts the hosted OAuth flow without an implicit browser redirect', async () => {
    const { client, auth } = createMockClient();
    auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://auth.example/google' }, error: null });

    const result = await signInWithGoogle(client, 'gym://auth-callback');

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'gym://auth-callback', skipBrowserRedirect: true },
    });
    expect(result).toEqual({ url: 'https://auth.example/google', error: null });
  });

  test('signInWithApple uses the same flow with provider "apple"', async () => {
    const { client, auth } = createMockClient();
    auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://auth.example/apple' }, error: null });

    await signInWithApple(client, 'gym://auth-callback');

    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'apple',
      options: { redirectTo: 'gym://auth-callback', skipBrowserRedirect: true },
    });
  });

  test('exchangeOAuthRedirectForSession exchanges the redirect URL for a session', async () => {
    const { client, auth } = createMockClient();
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: fakeUser, session: fakeSession },
      error: null,
    });

    const result = await exchangeOAuthRedirectForSession(client, 'gym://auth-callback?code=abc');

    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('gym://auth-callback?code=abc');
    expect(result.session).toBe(fakeSession);
  });
});

describe('password reset (FR-9.2)', () => {
  test('requestPasswordReset forwards email and redirectTo', async () => {
    const { client, auth } = createMockClient();
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });

    const result = await requestPasswordReset(client, 'a@example.com', 'gym://reset');

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('a@example.com', {
      redirectTo: 'gym://reset',
    });
    expect(result.error).toBeNull();
  });

  test('updatePassword sets the new password', async () => {
    const { client, auth } = createMockClient();
    auth.updateUser.mockResolvedValue({ error: null });

    const result = await updatePassword(client, 'newHunter3');

    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'newHunter3' });
    expect(result.error).toBeNull();
  });

  test('updatePassword surfaces an error', async () => {
    const { client, auth } = createMockClient();
    auth.updateUser.mockResolvedValue({ error: { message: 'Password too weak' } });

    const result = await updatePassword(client, '123');

    expect(result.error).toBe('Password too weak');
  });
});

describe('session helpers (FR-9.4)', () => {
  test('signOut calls auth.signOut', async () => {
    const { client, auth } = createMockClient();
    auth.signOut.mockResolvedValue({ error: null });

    await signOut(client);

    expect(auth.signOut).toHaveBeenCalled();
  });

  test('getSession returns the current session', async () => {
    const { client, auth } = createMockClient();
    auth.getSession.mockResolvedValue({ data: { session: fakeSession } });

    const session = await getSession(client);

    expect(session).toBe(fakeSession);
  });

  test('getSession returns null when signed out', async () => {
    const { client, auth } = createMockClient();
    auth.getSession.mockResolvedValue({ data: { session: null } });

    expect(await getSession(client)).toBeNull();
  });

  test('onAuthStateChange registers a callback and unsubscribe works', () => {
    const { client, auth } = createMockClient();
    const unsubscribe = jest.fn();
    let registeredCallback: ((event: string, session: unknown) => void) | undefined;
    auth.onAuthStateChange.mockImplementation((cb) => {
      registeredCallback = cb;
      return { data: { subscription: { unsubscribe } } };
    });

    const callback = jest.fn();
    const { unsubscribe: unsub } = onAuthStateChange(client, callback);

    registeredCallback?.('SIGNED_IN', fakeSession);
    expect(callback).toHaveBeenCalledWith(fakeSession);

    unsub();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
