import { act, fireEvent, render } from '@testing-library/react-native';

import RestTimer from './RestTimer';

describe('RestTimer (FR-5.4/UX-4)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('displays the initial duration formatted as m:ss', () => {
    const { getByTestId } = render(<RestTimer durationSeconds={90} />);
    expect(getByTestId('rest-timer-display').props.children).toBe('1:30');
  });

  test('counts down once started', () => {
    const { getByTestId } = render(<RestTimer durationSeconds={10} />);
    fireEvent.press(getByTestId('rest-timer-start'));

    act(() => { jest.advanceTimersByTime(3000); });

    expect(getByTestId('rest-timer-display').props.children).toBe('0:07');
  });

  test('pause stops the countdown', () => {
    const { getByTestId } = render(<RestTimer durationSeconds={10} />);
    fireEvent.press(getByTestId('rest-timer-start'));
    act(() => { jest.advanceTimersByTime(2000); });
    fireEvent.press(getByTestId('rest-timer-pause'));
    act(() => { jest.advanceTimersByTime(5000); });

    expect(getByTestId('rest-timer-display').props.children).toBe('0:08');
  });

  test('reset returns to the initial duration and stops the countdown', () => {
    const { getByTestId } = render(<RestTimer durationSeconds={10} />);
    fireEvent.press(getByTestId('rest-timer-start'));
    act(() => { jest.advanceTimersByTime(4000); });
    fireEvent.press(getByTestId('rest-timer-reset'));

    expect(getByTestId('rest-timer-display').props.children).toBe('0:10');

    act(() => { jest.advanceTimersByTime(3000); });
    expect(getByTestId('rest-timer-display').props.children).toBe('0:10');
  });

  test('calls onComplete when the countdown reaches zero', () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(<RestTimer durationSeconds={3} onComplete={onComplete} />);
    fireEvent.press(getByTestId('rest-timer-start'));

    act(() => { jest.advanceTimersByTime(3000); });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(getByTestId('rest-timer-display').props.children).toBe('0:00');
  });
});
