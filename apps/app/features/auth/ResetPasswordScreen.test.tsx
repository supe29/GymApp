import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import ResetPasswordScreen from './ResetPasswordScreen';

jest.mock('api-client', () => ({
  updatePassword: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

describe('ResetPasswordScreen (FR-9.2)', () => {
  afterEach(() => jest.clearAllMocks());

  test('updates the password and calls onPasswordUpdated', async () => {
    mockedApiClient.updatePassword.mockResolvedValue({ error: null });
    const onPasswordUpdated = jest.fn();
    const { getByTestId } = render(
      <ResetPasswordScreen client={fakeClient} onPasswordUpdated={onPasswordUpdated} />,
    );

    fireEvent.changeText(getByTestId('reset-password-new'), 'newHunter3');
    fireEvent.changeText(getByTestId('reset-password-confirm'), 'newHunter3');
    fireEvent.press(getByTestId('reset-password-submit'));

    await waitFor(() => expect(onPasswordUpdated).toHaveBeenCalled());
    expect(mockedApiClient.updatePassword).toHaveBeenCalledWith(fakeClient, 'newHunter3');
  });

  test('rejects mismatched passwords without calling the API', async () => {
    const { getByTestId } = render(<ResetPasswordScreen client={fakeClient} />);

    fireEvent.changeText(getByTestId('reset-password-new'), 'newHunter3');
    fireEvent.changeText(getByTestId('reset-password-confirm'), 'different');
    fireEvent.press(getByTestId('reset-password-submit'));

    await waitFor(() =>
      expect(getByTestId('reset-password-error').props.children).toBe('Passwords do not match.'),
    );
    expect(mockedApiClient.updatePassword).not.toHaveBeenCalled();
  });

  test('shows a server error on failure', async () => {
    mockedApiClient.updatePassword.mockResolvedValue({ error: 'Password too weak' });
    const onPasswordUpdated = jest.fn();
    const { getByTestId } = render(
      <ResetPasswordScreen client={fakeClient} onPasswordUpdated={onPasswordUpdated} />,
    );

    fireEvent.changeText(getByTestId('reset-password-new'), '123');
    fireEvent.changeText(getByTestId('reset-password-confirm'), '123');
    fireEvent.press(getByTestId('reset-password-submit'));

    await waitFor(() =>
      expect(getByTestId('reset-password-error').props.children).toBe('Password too weak'),
    );
    expect(onPasswordUpdated).not.toHaveBeenCalled();
  });
});
