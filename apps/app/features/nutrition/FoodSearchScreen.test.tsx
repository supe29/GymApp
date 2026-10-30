import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import FoodSearchScreen from './FoodSearchScreen';

jest.mock('api-client', () => ({
  searchFoodItems: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

describe('FoodSearchScreen (FR-7.1/UX-7)', () => {
  beforeEach(() => {
    mockedApiClient.searchFoodItems.mockReset();
  });

  test('searching renders matching results and selecting one calls onSelectFood', async () => {
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
    const onSelectFood = jest.fn();
    const { getByTestId } = render(
      <FoodSearchScreen client={fakeClient} onSelectFood={onSelectFood} onCancel={jest.fn()} />,
    );

    fireEvent.changeText(getByTestId('food-search-input'), 'ban');
    fireEvent.press(getByTestId('food-search-button'));

    await waitFor(() => expect(getByTestId('food-search-result-food-1')).toBeTruthy());
    fireEvent.press(getByTestId('food-search-result-food-1'));

    expect(onSelectFood).toHaveBeenCalledWith(expect.objectContaining({ id: 'food-1', name: 'Banana' }));
  });

  test('shows an empty-results message when nothing matches', async () => {
    mockedApiClient.searchFoodItems.mockResolvedValue({ data: [], error: null });
    const { getByTestId } = render(
      <FoodSearchScreen client={fakeClient} onSelectFood={jest.fn()} onCancel={jest.fn()} />,
    );

    fireEvent.changeText(getByTestId('food-search-input'), 'xyz');
    fireEvent.press(getByTestId('food-search-button'));

    await waitFor(() => expect(getByTestId('food-search-empty')).toBeTruthy());
  });

  test('cancel calls onCancel', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <FoodSearchScreen client={fakeClient} onSelectFood={jest.fn()} onCancel={onCancel} />,
    );
    fireEvent.press(getByTestId('food-search-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
