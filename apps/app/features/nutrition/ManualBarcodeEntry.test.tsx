import { fireEvent, render } from '@testing-library/react-native';

import ManualBarcodeEntry from './ManualBarcodeEntry';

describe('ManualBarcodeEntry (FR-7.4/AC-10)', () => {
  test('shows an optional notice (e.g. barcode not found)', () => {
    const { getByTestId } = render(
      <ManualBarcodeEntry notice="No food found for that barcode." onSubmit={jest.fn()} onCancel={jest.fn()} />,
    );
    expect(getByTestId('manual-barcode-notice').props.children).toBe('No food found for that barcode.');
  });

  test('submitting a non-empty barcode calls onSubmit with the trimmed value', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<ManualBarcodeEntry onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.changeText(getByTestId('manual-barcode-input'), '  012345678905  ');
    fireEvent.press(getByTestId('manual-barcode-submit'));

    expect(onSubmit).toHaveBeenCalledWith('012345678905');
  });

  test('cancel calls onCancel', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(<ManualBarcodeEntry onSubmit={jest.fn()} onCancel={onCancel} />);
    fireEvent.press(getByTestId('manual-barcode-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
});
