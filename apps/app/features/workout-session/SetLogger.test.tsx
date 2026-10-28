import { fireEvent, render } from '@testing-library/react-native';

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

  test('UX-4: weight/reps/RPE are adjusted via steppers, not free text entry', () => {
    const { getByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Squat" loggedSets={[]} onLogSet={jest.fn()} />,
    );

    fireEvent.press(getByTestId('set-logger-ex-1-weight-inc'));
    fireEvent.press(getByTestId('set-logger-ex-1-weight-inc'));
    expect(getByTestId('set-logger-ex-1-weight-value').props.children).toBe(5);

    fireEvent.press(getByTestId('set-logger-ex-1-weight-dec'));
    expect(getByTestId('set-logger-ex-1-weight-value').props.children).toBe(2.5);

    fireEvent.press(getByTestId('set-logger-ex-1-reps-inc'));
    expect(getByTestId('set-logger-ex-1-reps-value').props.children).toBe(1);
  });

  test('weight stepper never goes below zero', () => {
    const { getByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Squat" loggedSets={[]} onLogSet={jest.fn()} />,
    );
    fireEvent.press(getByTestId('set-logger-ex-1-weight-dec'));
    expect(getByTestId('set-logger-ex-1-weight-value').props.children).toBe(0);
  });

  test('RPE stepper clears back to "-" rather than going negative', () => {
    const { getByTestId } = render(
      <SetLogger exerciseId="ex-1" exerciseName="Squat" loggedSets={[]} onLogSet={jest.fn()} />,
    );
    expect(getByTestId('set-logger-ex-1-rpe-value').props.children).toBe('-');
    fireEvent.press(getByTestId('set-logger-ex-1-rpe-dec'));
    expect(getByTestId('set-logger-ex-1-rpe-value').props.children).toBe('-');
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
});
