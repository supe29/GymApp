import { fireEvent, render } from '@testing-library/react-native';

import LogWeightModal from './LogWeightModal';

describe('LogWeightModal (FR-8.1/UX-4/UX-8)', () => {
  test('metric: steps in 0.5kg increments and submits kg directly', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<LogWeightModal unitPreference="metric" onSubmit={onSubmit} onCancel={jest.fn()} />);

    fireEvent.press(getByTestId('log-weight-inc'));
    expect(getByTestId('log-weight-value').props.value).toBe('70.5');

    fireEvent.press(getByTestId('log-weight-submit'));
    expect(onSubmit).toHaveBeenCalledWith(70.5);
  });

  test('imperial: steps in 1lb increments and submits the kg-converted value', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(<LogWeightModal unitPreference="imperial" onSubmit={onSubmit} onCancel={jest.fn()} />);

    const initialLb = Number(getByTestId('log-weight-value').props.value);
    fireEvent.press(getByTestId('log-weight-dec'));
    fireEvent.press(getByTestId('log-weight-submit'));

    const KG_PER_LB = 0.45359237;
    expect(onSubmit).toHaveBeenCalledWith((initialLb - 1) * KG_PER_LB);
  });

  test('cancel calls onCancel', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(<LogWeightModal unitPreference="metric" onSubmit={jest.fn()} onCancel={onCancel} />);
    fireEvent.press(getByTestId('log-weight-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  test('starts from the provided latest weight and accepts a typed value', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <LogWeightModal unitPreference="metric" initialWeightKg={82.4} onSubmit={onSubmit} onCancel={jest.fn()} />,
    );
    expect(getByTestId('log-weight-value').props.value).toBe('82.4');

    fireEvent.changeText(getByTestId('log-weight-value'), '101.2');
    fireEvent.press(getByTestId('log-weight-submit'));
    expect(onSubmit).toHaveBeenCalledWith(101.2);
  });
});
