import { fireEvent, render } from '@testing-library/react-native';

import DisclaimerScreen from './DisclaimerScreen';

describe('DisclaimerScreen (SR-5/AC-14)', () => {
  test('Continue is disabled until the checkbox is checked', () => {
    const onAcknowledge = jest.fn();
    const { getByTestId } = render(<DisclaimerScreen onAcknowledge={onAcknowledge} />);

    fireEvent.press(getByTestId('disclaimer-continue'));

    expect(onAcknowledge).not.toHaveBeenCalled();
  });

  test('checking the box then pressing Continue calls onAcknowledge', () => {
    const onAcknowledge = jest.fn();
    const { getByTestId } = render(<DisclaimerScreen onAcknowledge={onAcknowledge} />);

    fireEvent.press(getByTestId('disclaimer-checkbox'));
    fireEvent.press(getByTestId('disclaimer-continue'));

    expect(onAcknowledge).toHaveBeenCalled();
  });

  test('unchecking the box disables Continue again', () => {
    const onAcknowledge = jest.fn();
    const { getByTestId } = render(<DisclaimerScreen onAcknowledge={onAcknowledge} />);

    fireEvent.press(getByTestId('disclaimer-checkbox'));
    fireEvent.press(getByTestId('disclaimer-checkbox'));
    fireEvent.press(getByTestId('disclaimer-continue'));

    expect(onAcknowledge).not.toHaveBeenCalled();
  });
});
