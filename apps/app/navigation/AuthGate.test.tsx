import { act, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';
import { Text } from 'react-native';

import AuthGate from './AuthGate';

jest.mock('api-client', () => ({
  getSession: jest.fn(),
  onAuthStateChange: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

describe('AuthGate (FR-9.4: no functionality reachable without signing in)', () => {
  afterEach(() => jest.clearAllMocks());

  test('renders the signed-out view, not children, when there is no session', async () => {
    mockedApiClient.getSession.mockResolvedValue(null);
    mockedApiClient.onAuthStateChange.mockReturnValue({ unsubscribe: jest.fn() });

    const { getByTestId, queryByTestId } = render(
      <AuthGate
        client={fakeClient}
        renderSignedOut={() => <Text testID="signed-out-view">Sign in please</Text>}
      >
        <Text testID="protected-content">Secret dashboard</Text>
      </AuthGate>,
    );

    await waitFor(() => expect(getByTestId('signed-out-view')).toBeTruthy());
    expect(queryByTestId('protected-content')).toBeNull();
  });

  test('renders children when a session exists', async () => {
    mockedApiClient.getSession.mockResolvedValue({ access_token: 't' } as never);
    mockedApiClient.onAuthStateChange.mockReturnValue({ unsubscribe: jest.fn() });

    const { getByTestId, queryByTestId } = render(
      <AuthGate
        client={fakeClient}
        renderSignedOut={() => <Text testID="signed-out-view">Sign in please</Text>}
      >
        <Text testID="protected-content">Secret dashboard</Text>
      </AuthGate>,
    );

    await waitFor(() => expect(getByTestId('protected-content')).toBeTruthy());
    expect(queryByTestId('signed-out-view')).toBeNull();
  });

  test('switches to signed-out content when the session is later lost', async () => {
    mockedApiClient.getSession.mockResolvedValue({ access_token: 't' } as never);
    let authCallback: Parameters<typeof apiClient.onAuthStateChange>[1] | undefined;
    mockedApiClient.onAuthStateChange.mockImplementation((_client, cb) => {
      authCallback = cb;
      return { unsubscribe: jest.fn() };
    });

    const { getByTestId, queryByTestId } = render(
      <AuthGate
        client={fakeClient}
        renderSignedOut={() => <Text testID="signed-out-view">Sign in please</Text>}
      >
        <Text testID="protected-content">Secret dashboard</Text>
      </AuthGate>,
    );

    await waitFor(() => expect(getByTestId('protected-content')).toBeTruthy());

    act(() => {
      authCallback?.(null);
    });

    await waitFor(() => expect(getByTestId('signed-out-view')).toBeTruthy());
    expect(queryByTestId('protected-content')).toBeNull();
  });

  test('unsubscribes on unmount', () => {
    const unsubscribe = jest.fn();
    mockedApiClient.getSession.mockResolvedValue(null);
    mockedApiClient.onAuthStateChange.mockReturnValue({ unsubscribe });

    const { unmount } = render(
      <AuthGate client={fakeClient} renderSignedOut={() => <Text>Out</Text>}>
        <Text>In</Text>
      </AuthGate>,
    );

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
