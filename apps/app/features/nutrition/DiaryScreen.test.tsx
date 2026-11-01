import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import DiaryScreen from './DiaryScreen';

jest.mock('api-client', () => ({
  getFoodLogEntriesForDate: jest.fn(),
  getCurrentNutritionTargets: jest.fn(),
  logFoodEntry: jest.fn(),
  deleteFoodLogEntry: jest.fn(),
  lookupFoodByBarcode: jest.fn(),
  searchFoodItems: jest.fn(),
}));

jest.mock('./BarcodeScanScreen', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onBarcodeScanned, onManualEntry }: { onBarcodeScanned: (b: string) => void; onManualEntry: () => void }) => (
      <>
        <Pressable testID="mock-scan-found" onPress={() => onBarcodeScanned('012345678905')}>
          <Text>scan-found</Text>
        </Pressable>
        <Pressable testID="mock-scan-manual" onPress={onManualEntry}>
          <Text>scan-manual</Text>
        </Pressable>
      </>
    ),
  };
});

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

const TARGETS = {
  id: 'target-1',
  dailyCalories: 2000,
  proteinG: 150,
  carbsG: 200,
  fatG: 60,
  targetVersion: 1,
  effectiveFrom: '2026-01-01T00:00:00Z',
};

function entry(overrides: Partial<apiClient.FoodLogEntryForDiary> = {}): apiClient.FoodLogEntryForDiary {
  return {
    id: 'entry-1',
    mealSlot: 'breakfast',
    portionQuantity: 1,
    caloriesPerPortion: 105,
    proteinGPerPortion: 1.3,
    carbsGPerPortion: 27,
    fatGPerPortion: 0.4,
    foodItemId: 'food-1',
    foodName: 'Banana',
    portionDescription: '1 medium',
    logDate: '2026-10-28',
    loggedAt: '2026-10-28T08:00:00Z',
    ...overrides,
  };
}

describe('DiaryScreen (FR-7.1/FR-7.2/FR-7.3/FR-7.4/AC-9/AC-10)', () => {
  beforeEach(() => {
    mockedApiClient.getFoodLogEntriesForDate.mockReset();
    mockedApiClient.getCurrentNutritionTargets.mockReset();
    mockedApiClient.logFoodEntry.mockReset();
    mockedApiClient.deleteFoodLogEntry.mockReset();
    mockedApiClient.lookupFoodByBarcode.mockReset();
    mockedApiClient.searchFoodItems.mockReset();
  });

  test('AC-9: shows totals against the current target and existing entries grouped by meal', async () => {
    mockedApiClient.getFoodLogEntriesForDate.mockResolvedValue({ data: [entry()], error: null });
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: TARGETS, error: null });

    const { getByTestId } = render(<DiaryScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('diary-totals')).toBeTruthy());
    expect(getByTestId('diary-entry-entry-1')).toBeTruthy();
    expect(getByTestId('diary-meal-group-breakfast')).toBeTruthy();
  });

  test('UX-9: the empty state\'s action opens food search', async () => {
    mockedApiClient.getFoodLogEntriesForDate.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: TARGETS, error: null });

    const { getByTestId } = render(<DiaryScreen client={fakeClient} userId="user-1" />);

    await waitFor(() => expect(getByTestId('diary-empty-action')).toBeTruthy());
    fireEvent.press(getByTestId('diary-empty-action'));
    await waitFor(() => expect(getByTestId('food-search-screen')).toBeTruthy());
  });

  test('logs a food found via search and reflects it in totals', async () => {
    mockedApiClient.getFoodLogEntriesForDate
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [entry()], error: null });
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: TARGETS, error: null });
    mockedApiClient.searchFoodItems.mockResolvedValue({
      data: [
        {
          id: 'food-1',
          name: 'Banana',
          brand: null,
          barcode: null,
          portionDescription: '1 medium',
          caloriesPerPortion: 105,
          proteinGPerPortion: 1.3,
          carbsGPerPortion: 27,
          fatGPerPortion: 0.4,
          source: 'external',
          createdByUserId: null,
        },
      ],
      error: null,
    });
    mockedApiClient.logFoodEntry.mockResolvedValue({
      data: {
        id: 'entry-1',
        foodItemId: 'food-1',
        mealSlot: 'breakfast',
        portionQuantity: 1,
        logDate: '2026-10-28',
        loggedAt: '2026-10-28T08:00:00Z',
        nutritionTargetId: 'target-1',
      },
      error: null,
    });

    const { getByTestId } = render(<DiaryScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('diary-empty')).toBeTruthy());

    fireEvent.press(getByTestId('diary-add-search-button'));
    await waitFor(() => expect(getByTestId('food-search-screen')).toBeTruthy());
    fireEvent.changeText(getByTestId('food-search-input'), 'ban');
    fireEvent.press(getByTestId('food-search-button'));
    await waitFor(() => expect(getByTestId('food-search-result-food-1')).toBeTruthy());
    fireEvent.press(getByTestId('food-search-result-food-1'));

    await waitFor(() => expect(getByTestId('diary-confirm-portion')).toBeTruthy());
    fireEvent.press(getByTestId('diary-confirm-log-button'));

    await waitFor(() =>
      expect(mockedApiClient.logFoodEntry).toHaveBeenCalledWith(fakeClient, 'user-1', {
        foodItemId: 'food-1',
        mealSlot: 'breakfast',
        portionQuantity: 1,
        logDate: expect.any(String),
      }),
    );
    await waitFor(() => expect(getByTestId('diary-entry-entry-1')).toBeTruthy());
  });

  test('a gram-based portion is entered as an amount in grams', async () => {
    mockedApiClient.getFoodLogEntriesForDate.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: TARGETS, error: null });
    mockedApiClient.searchFoodItems.mockResolvedValue({
      data: [
        {
          id: 'food-2',
          name: 'Chicken Breast, cooked',
          brand: null,
          barcode: null,
          portionDescription: '100g',
          caloriesPerPortion: 165,
          proteinGPerPortion: 31,
          carbsGPerPortion: 0,
          fatGPerPortion: 3.6,
          source: 'external',
          createdByUserId: null,
        },
      ],
      error: null,
    });
    mockedApiClient.logFoodEntry.mockResolvedValue({ data: null, error: 'stop here' });

    const { getByTestId } = render(<DiaryScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('diary-empty')).toBeTruthy());
    fireEvent.press(getByTestId('diary-add-search-button'));
    await waitFor(() => expect(getByTestId('food-search-screen')).toBeTruthy());
    fireEvent.changeText(getByTestId('food-search-input'), 'chicken');
    fireEvent.press(getByTestId('food-search-button'));
    await waitFor(() => expect(getByTestId('food-search-result-food-2')).toBeTruthy());
    fireEvent.press(getByTestId('food-search-result-food-2'));
    await waitFor(() => expect(getByTestId('diary-confirm-portion')).toBeTruthy());

    expect(getByTestId('diary-amount-value').props.value).toBe('100');
    fireEvent.changeText(getByTestId('diary-amount-value'), '180');
    expect(getByTestId('diary-portion-total').props.children.join('')).toBe('297 kcal');
    fireEvent.press(getByTestId('diary-confirm-log-button'));

    await waitFor(() =>
      expect(mockedApiClient.logFoodEntry).toHaveBeenCalledWith(
        fakeClient,
        'user-1',
        expect.objectContaining({ foodItemId: 'food-2', portionQuantity: 1.8 }),
      ),
    );
  });

  test('AC-10: a barcode scan that finds nothing in the data source offers manual entry, never a dead end', async () => {
    mockedApiClient.getFoodLogEntriesForDate.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: TARGETS, error: null });
    mockedApiClient.lookupFoodByBarcode.mockResolvedValue({ data: null, error: null });

    const { getByTestId } = render(<DiaryScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('diary-add-scan-button')).toBeTruthy());

    fireEvent.press(getByTestId('diary-add-scan-button'));
    fireEvent.press(getByTestId('mock-scan-found'));

    await waitFor(() => expect(getByTestId('manual-barcode-entry')).toBeTruthy());
    expect(getByTestId('manual-barcode-notice').props.children).toMatch(/no food found/i);
  });

  test('a successful barcode scan routes straight to the portion-confirm step', async () => {
    mockedApiClient.getFoodLogEntriesForDate.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: TARGETS, error: null });
    mockedApiClient.lookupFoodByBarcode.mockResolvedValue({
      data: {
        id: 'food-9',
        name: 'Protein Bar',
        brand: 'Acme',
        barcode: '012345678905',
        portionDescription: '1 bar',
        caloriesPerPortion: 220,
        proteinGPerPortion: 20,
        carbsGPerPortion: 22,
        fatGPerPortion: 8,
        source: 'external',
        createdByUserId: null,
      },
      error: null,
    });

    const { getByTestId } = render(<DiaryScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('diary-add-scan-button')).toBeTruthy());

    fireEvent.press(getByTestId('diary-add-scan-button'));
    fireEvent.press(getByTestId('mock-scan-found'));

    await waitFor(() => expect(getByTestId('diary-confirm-portion')).toBeTruthy());
    expect(getByTestId('diary-confirm-log-button')).toBeTruthy();
  });

  test('deleting an entry calls deleteFoodLogEntry and refreshes the list', async () => {
    mockedApiClient.getFoodLogEntriesForDate
      .mockResolvedValueOnce({ data: [entry()], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    mockedApiClient.getCurrentNutritionTargets.mockResolvedValue({ data: TARGETS, error: null });
    mockedApiClient.deleteFoodLogEntry.mockResolvedValue({ data: null, error: null });

    const { getByTestId } = render(<DiaryScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(getByTestId('diary-entry-entry-1-delete')).toBeTruthy());

    fireEvent.press(getByTestId('diary-entry-entry-1-delete'));

    await waitFor(() => expect(mockedApiClient.deleteFoodLogEntry).toHaveBeenCalledWith(fakeClient, 'user-1', 'entry-1'));
    await waitFor(() => expect(getByTestId('diary-empty')).toBeTruthy());
  });
});
