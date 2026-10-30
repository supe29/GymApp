import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import PersonalRecordsScreen from './PersonalRecordsScreen';

jest.mock('api-client', () => ({
  getPersonalRecordsForUser: jest.fn(),
  getProfile: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

describe('PersonalRecordsScreen (FR-8.2/FR-8.3/UX-8)', () => {
  beforeEach(() => {
    mockedApiClient.getPersonalRecordsForUser.mockReset();
    mockedApiClient.getProfile.mockReset();
  });

  test('reduces full PR history to the current record per bucket and displays it', async () => {
    mockedApiClient.getPersonalRecordsForUser.mockResolvedValue({
      data: [
        {
          id: 'pr-1',
          exerciseId: 'ex-squat',
          exerciseName: 'Squat',
          setLogId: 'log-1',
          repCount: 5,
          weightKg: 100,
          estimatedOneRm: 116.7,
          achievedAt: '2026-10-01T00:00:00Z',
        },
        {
          id: 'pr-2',
          exerciseId: 'ex-squat',
          exerciseName: 'Squat',
          setLogId: 'log-2',
          repCount: 5,
          weightKg: 110,
          estimatedOneRm: 128.3,
          achievedAt: '2026-10-15T00:00:00Z',
        },
      ],
      error: null,
    });
    mockedApiClient.getProfile.mockResolvedValue({ data: { unit_preference: 'metric' } as never, error: null });

    const { getByTestId, queryByTestId } = render(<PersonalRecordsScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('personal-record-ex-squat-5')).toBeTruthy());
    // Only the current (heaviest) record for the bucket is displayed — the
    // older, superseded 100kg entry is not shown as a separate row.
    expect(getByTestId('personal-record-ex-squat-5').props.children[1].props.children.join('')).toContain('110.0');
    expect(queryByTestId('personal-record-ex-squat-5-100')).toBeNull();
  });

  test('shows an empty-state message with no PR history', async () => {
    mockedApiClient.getPersonalRecordsForUser.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getProfile.mockResolvedValue({ data: { unit_preference: 'metric' } as never, error: null });

    const { getByTestId } = render(<PersonalRecordsScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('personal-records-empty')).toBeTruthy());
  });

  test('UX-9: the empty state offers a working "start a workout" action when onStartWorkout is given', async () => {
    mockedApiClient.getPersonalRecordsForUser.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getProfile.mockResolvedValue({ data: { unit_preference: 'metric' } as never, error: null });
    const onStartWorkout = jest.fn();

    const { getByTestId } = render(
      <PersonalRecordsScreen client={fakeClient} userId="user-1" onStartWorkout={onStartWorkout} />,
    );

    await waitFor(() => expect(getByTestId('personal-records-empty-action')).toBeTruthy());
    fireEvent.press(getByTestId('personal-records-empty-action'));
    expect(onStartWorkout).toHaveBeenCalled();
  });
});
