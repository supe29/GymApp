import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import WeightTrendScreen from './WeightTrendScreen';

jest.mock('api-client', () => ({
  getWeightEntries: jest.fn(),
  getProfile: jest.fn(),
  logWeightEntry: jest.fn(),
  deleteWeightEntry: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

function profile(unitPreference: 'metric' | 'imperial' = 'metric') {
  return { data: { unit_preference: unitPreference } as never, error: null };
}

describe('WeightTrendScreen (FR-8.1/AC-12/UX-8)', () => {
  beforeEach(() => {
    mockedApiClient.getWeightEntries.mockReset();
    mockedApiClient.getProfile.mockReset();
    mockedApiClient.logWeightEntry.mockReset();
    mockedApiClient.deleteWeightEntry.mockReset();
  });

  test('AC-12: renders a trend chart with at least two entries in metric', async () => {
    mockedApiClient.getWeightEntries.mockResolvedValue({
      data: [
        { id: 'e1', weightKg: 80, measuredAt: '2026-10-01T00:00:00Z' },
        { id: 'e2', weightKg: 79, measuredAt: '2026-10-15T00:00:00Z' },
      ],
      error: null,
    });
    mockedApiClient.getProfile.mockResolvedValue(profile('metric'));

    const { getByTestId, getByText } = render(<WeightTrendScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('weight-trend-chart')).toBeTruthy());
    expect(getByText('80.0 kg')).toBeTruthy();
    expect(getByText('79.0 kg')).toBeTruthy();
  });

  test('AC-12: renders correctly in imperial units', async () => {
    mockedApiClient.getWeightEntries.mockResolvedValue({
      data: [
        { id: 'e1', weightKg: 80, measuredAt: '2026-10-01T00:00:00Z' },
        { id: 'e2', weightKg: 79, measuredAt: '2026-10-15T00:00:00Z' },
      ],
      error: null,
    });
    mockedApiClient.getProfile.mockResolvedValue(profile('imperial'));

    const { getByTestId, getAllByText, queryByText } = render(<WeightTrendScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('weight-trend-chart')).toBeTruthy());
    expect(getAllByText(/lb/).length).toBeGreaterThan(0);
    expect(queryByText('80.0 kg')).toBeNull();
  });

  test('shows an empty-state message with fewer than two entries', async () => {
    mockedApiClient.getWeightEntries.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getProfile.mockResolvedValue(profile('metric'));

    const { getByTestId } = render(<WeightTrendScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('weight-trend-empty')).toBeTruthy());
  });

  test("UX-9: the empty state's action opens the log-weight modal", async () => {
    mockedApiClient.getWeightEntries.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getProfile.mockResolvedValue(profile('metric'));

    const { getByTestId } = render(<WeightTrendScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('weight-trend-empty-action')).toBeTruthy());
    fireEvent.press(getByTestId('weight-trend-empty-action'));
    await waitFor(() => expect(getByTestId('log-weight-modal')).toBeTruthy());
  });

  test('logging a new weight entry refreshes the list', async () => {
    mockedApiClient.getWeightEntries
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'e1', weightKg: 75, measuredAt: '2026-10-28T00:00:00Z' }], error: null });
    mockedApiClient.getProfile.mockResolvedValue(profile('metric'));
    mockedApiClient.logWeightEntry.mockResolvedValue({ data: { id: 'e1', weightKg: 75, measuredAt: '2026-10-28T00:00:00Z' }, error: null });

    const { getByTestId } = render(<WeightTrendScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('weight-trend-log-button')).toBeTruthy());

    fireEvent.press(getByTestId('weight-trend-log-button'));
    await waitFor(() => expect(getByTestId('log-weight-modal')).toBeTruthy());
    fireEvent.press(getByTestId('log-weight-submit'));

    await waitFor(() => expect(mockedApiClient.logWeightEntry).toHaveBeenCalled());
    await waitFor(() => expect(getByTestId('weight-entry-e1')).toBeTruthy());
  });

  test('deleting an entry calls deleteWeightEntry and refreshes', async () => {
    mockedApiClient.getWeightEntries
      .mockResolvedValueOnce({
        data: [
          { id: 'e1', weightKg: 80, measuredAt: '2026-10-01T00:00:00Z' },
          { id: 'e2', weightKg: 79, measuredAt: '2026-10-15T00:00:00Z' },
        ],
        error: null,
      })
      .mockResolvedValueOnce({ data: [], error: null });
    mockedApiClient.getProfile.mockResolvedValue(profile('metric'));
    mockedApiClient.deleteWeightEntry.mockResolvedValue({ data: null, error: null });

    const { getByTestId } = render(<WeightTrendScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('weight-entry-e1-delete')).toBeTruthy());

    fireEvent.press(getByTestId('weight-entry-e1-delete'));

    await waitFor(() => expect(mockedApiClient.deleteWeightEntry).toHaveBeenCalledWith(fakeClient, 'user-1', 'e1'));
    await waitFor(() => expect(getByTestId('weight-trend-empty')).toBeTruthy());
  });
});
