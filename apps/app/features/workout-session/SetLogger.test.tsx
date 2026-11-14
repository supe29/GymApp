import { act, fireEvent, render } from '@testing-library/react-native';
import { Vibration } from 'react-native';

import SetLogger, { type LoggedSetDisplay } from './SetLogger';

describe('SetLogger (FR-5.1/UX-4)', () => {
  test('renders already-logged sets with their sync status', () => {
    const loggedSets: LoggedSetDisplay[] = [
      { id: 's1', setIndex: 1, weightKg: 50, reps: 10, rpe: null, syncStatus: 'synced' },
      { id: 's2', setIndex: 2, weightKg: 52.5, reps: 8, rpe: 8, syncStatus: 'pending' },
    ];
    const { getByTestId, getByText } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Squat" loggedSets={loggedSets} onLogSet={jest.fn()} />,
    );

    expect(getByText('Squat')).toBeTruthy();
    expect(getByTestId('set-logger-ex-1-set-1-status').props.children).toBe('Synced');
    expect(getByTestId('set-logger-ex-1-set-2-status').props.children).toBe('Pending sync…');
  });

  test('UX-4: weight/reps/RPE are adjusted via +/- steppers', () => {
    const { getByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Squat" loggedSets={[]} onLogSet={jest.fn()} />,
    );

    fireEvent.press(getByTestId('set-logger-ex-1-weight-inc'));
    fireEvent.press(getByTestId('set-logger-ex-1-weight-inc'));
    expect(getByTestId('set-logger-ex-1-weight-value').props.value).toBe('5');

    fireEvent.press(getByTestId('set-logger-ex-1-weight-dec'));
    expect(getByTestId('set-logger-ex-1-weight-value').props.value).toBe('2.5');

    fireEvent.press(getByTestId('set-logger-ex-1-reps-inc'));
    expect(getByTestId('set-logger-ex-1-reps-value').props.value).toBe('1');
  });

  test('weight stepper never goes below zero', () => {
    const { getByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Squat" loggedSets={[]} onLogSet={jest.fn()} />,
    );
    fireEvent.press(getByTestId('set-logger-ex-1-weight-dec'));
    expect(getByTestId('set-logger-ex-1-weight-value').props.value).toBe('0');
  });

  test('RPE stepper clears back to "-" rather than going negative', () => {
    const { getByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Squat" loggedSets={[]} onLogSet={jest.fn()} />,
    );
    expect(getByTestId('set-logger-ex-1-rpe-value').props.value).toBe('');
    fireEvent.press(getByTestId('set-logger-ex-1-rpe-dec'));
    expect(getByTestId('set-logger-ex-1-rpe-value').props.value).toBe('');
  });

  test('pressing "Log set" calls onLogSet with the current stepper values', () => {
    const onLogSet = jest.fn();
    const { getByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Squat" loggedSets={[]} onLogSet={onLogSet} />,
    );

    fireEvent.press(getByTestId('set-logger-ex-1-weight-inc'));
    fireEvent.press(getByTestId('set-logger-ex-1-reps-inc'));
    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));

    expect(onLogSet).toHaveBeenCalledWith({ weightKg: 2.5, reps: 1, rpe: null });
  });

  test('a failed set shows a retry affordance that calls onRetrySet', () => {
    const onRetrySet = jest.fn();
    const loggedSets: LoggedSetDisplay[] = [
      { id: 's1', setIndex: 1, weightKg: 50, reps: 10, rpe: null, syncStatus: 'failed' },
    ];
    const { getByTestId } = render(
      <SetLogger
        exerciseId="ex-1"
        exerciseName="Squat"
        loggedSets={loggedSets}
        onLogSet={jest.fn()}
        onRetrySet={onRetrySet}
      />,
    );

    expect(getByTestId('set-logger-ex-1-set-1-status').props.children).toBe("Couldn't sync");
    fireEvent.press(getByTestId('set-logger-ex-1-set-1-retry'));
    expect(onRetrySet).toHaveBeenCalledWith('s1');
  });

  test('values can be typed directly, so a big jump is one edit', () => {
    const onLogSet = jest.fn();
    const { getByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Squat" loggedSets={[]} onLogSet={onLogSet} />,
    );
    fireEvent.changeText(getByTestId('set-logger-ex-1-weight-value'), '102,5');
    fireEvent.changeText(getByTestId('set-logger-ex-1-reps-value'), '5');
    fireEvent.press(getByTestId('set-logger-ex-1-weight-inc'));
    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));
    expect(onLogSet).toHaveBeenCalledWith({ weightKg: 105, reps: 5, rpe: null });
  });

  test('shows the prescription and pre-fills reps/weight from it', () => {
    const loggedSets: LoggedSetDisplay[] = [
      { id: 's1', setIndex: 1, weightKg: 60, reps: 8, rpe: null, syncStatus: 'synced' },
    ];
    const { getByTestId } = render(
      <SetLogger
        exerciseId="ex-1"
        exerciseName="Squat"
        loggedSets={loggedSets}
        onLogSet={jest.fn()}
        target={{ sets: 4, repsMin: 8, repsMax: 12, weightKg: 60 }}
      />,
    );
    expect(getByTestId('set-logger-ex-1-target').props.children.join('')).toBe(
      'Target: 4 × 8–12 reps @ 60 kg · 1/4 sets done',
    );
    expect(getByTestId('set-logger-ex-1-weight-value').props.value).toBe('60');
    expect(getByTestId('set-logger-ex-1-reps-value').props.value).toBe('8');
  });
});

describe('SetLogger rest between sets (FR-5.4)', () => {
  const rest = { seconds: 90, reason: 'This exercise works one joint, so it recovers faster between sets.' };
  const target = { sets: 3, repsMin: 8, repsMax: 12, weightKg: null };
  const set = (i: number): LoggedSetDisplay => ({ id: `s${i}`, setIndex: i, weightKg: 20, reps: 10, rpe: null, syncStatus: 'synced' });

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("shows the exercise's rest, with its reason on demand", () => {
    const { getByTestId, queryByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Curl" loggedSets={[]} onLogSet={jest.fn()} rest={rest} />,
    );
    expect(getByTestId('set-logger-ex-1-rest').props.children).toBe('Rest 1:30 between sets');
    expect(queryByTestId('set-logger-ex-1-rest-why')).toBeNull();
    fireEvent.press(getByTestId('set-logger-ex-1-rest-why-toggle'));
    expect(getByTestId('set-logger-ex-1-rest-why').props.children).toBe(rest.reason);
    expect(queryByTestId('set-logger-ex-1-rest-countdown')).toBeNull();
  });

  test('logging a set starts the countdown, which ends with a vibration and a ready message', () => {
    const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
    const { getByTestId, queryByTestId, rerender } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Curl" loggedSets={[]} onLogSet={jest.fn()} rest={rest} target={target} />,
    );

    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));
    rerender(<SetLogger exerciseId="ex-1" exerciseName="Curl" loggedSets={[set(1)]} onLogSet={jest.fn()} rest={rest} target={target} />);
    expect(getByTestId('set-logger-ex-1-rest-remaining').props.children).toBe('1:30');

    act(() => jest.advanceTimersByTime(30_000));
    expect(getByTestId('set-logger-ex-1-rest-remaining').props.children).toBe('1:00');
    expect(vibrate).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(60_000));
    expect(queryByTestId('set-logger-ex-1-rest-countdown')).toBeNull();
    expect(getByTestId('set-logger-ex-1-rest-over').props.children.props.children).toBe('Rest over. Ready for set 2.');
    expect(vibrate).toHaveBeenCalledTimes(1);
    vibrate.mockRestore();
  });

  test('logging another set restarts the countdown', () => {
    const { getByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Curl" loggedSets={[set(1)]} onLogSet={jest.fn()} rest={rest} />,
    );
    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));
    act(() => jest.advanceTimersByTime(80_000));
    expect(getByTestId('set-logger-ex-1-rest-remaining').props.children).toBe('0:10');
    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));
    act(() => jest.advanceTimersByTime(1_000));
    expect(getByTestId('set-logger-ex-1-rest-remaining').props.children).toBe('1:29');
  });

  test('no rest is counted after the last prescribed set', () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Curl" loggedSets={[set(1), set(2)]} onLogSet={jest.fn()} rest={rest} target={target} />,
    );
    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));
    rerender(
      <SetLogger exerciseId="ex-1" exerciseName="Curl" loggedSets={[set(1), set(2), set(3)]} onLogSet={jest.fn()} rest={rest} target={target} />,
    );
    expect(queryByTestId('set-logger-ex-1-rest-countdown')).toBeNull();
    expect(queryByTestId('set-logger-ex-1-rest-over')).toBeNull();
  });

  test('without a rest, logging shows no countdown', () => {
    const { getByTestId, queryByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Curl" loggedSets={[]} onLogSet={jest.fn()} />,
    );
    fireEvent.press(getByTestId('set-logger-ex-1-log-button'));
    expect(queryByTestId('set-logger-ex-1-rest')).toBeNull();
    expect(queryByTestId('set-logger-ex-1-rest-countdown')).toBeNull();
  });
});
