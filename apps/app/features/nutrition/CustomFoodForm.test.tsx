import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import CustomFoodForm from './CustomFoodForm';

jest.mock('api-client', () => ({
  createCustomFoodItem: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

describe('CustomFoodForm (FR-7.1/DR-2/A-7)', () => {
  beforeEach(() => {
    mockedApiClient.createCustomFoodItem.mockReset();
  });

  test('submits the entered fields and calls onCreated with the saved food', async () => {
    mockedApiClient.createCustomFoodItem.mockResolvedValue({
      data: {
        id: 'food-9',
        name: "Mom's lasagna",
        brand: null,
        barcode: null,
        portionDescription: '1 slice',
        caloriesPerPortion: 400,
        proteinGPerPortion: 20,
        carbsGPerPortion: 30,
        fatGPerPortion: 18,
        source: 'user_created',
        createdByUserId: 'user-1',
      },
      error: null,
    });
    const onCreated = jest.fn();
    const { getByTestId } = render(
      <CustomFoodForm client={fakeClient} userId="user-1" onCreated={onCreated} onCancel={jest.fn()} />,
    );

    fireEvent.changeText(getByTestId('custom-food-name'), "Mom's lasagna");
    fireEvent.changeText(getByTestId('custom-food-portion'), '1 slice');
    fireEvent.changeText(getByTestId('custom-food-calories'), '400');
    fireEvent.changeText(getByTestId('custom-food-protein'), '20');
    fireEvent.changeText(getByTestId('custom-food-carbs'), '30');
    fireEvent.changeText(getByTestId('custom-food-fat'), '18');
    fireEvent.press(getByTestId('custom-food-submit'));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(mockedApiClient.createCustomFoodItem).toHaveBeenCalledWith(fakeClient, 'user-1', {
      name: "Mom's lasagna",
      portionDescription: '1 slice',
      caloriesPerPortion: 400,
      proteinGPerPortion: 20,
      carbsGPerPortion: 30,
      fatGPerPortion: 18,
    });
  });

  test('cancel calls onCancel', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <CustomFoodForm client={fakeClient} userId="user-1" onCreated={jest.fn()} onCancel={onCancel} />,
    );
    fireEvent.press(getByTestId('custom-food-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
