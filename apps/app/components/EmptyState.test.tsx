import { fireEvent, render } from '@testing-library/react-native';

import EmptyState from './EmptyState';

describe('EmptyState (UX-9)', () => {
  test('renders the title and message', () => {
    const { getByTestId, getByText } = render(<EmptyState title="Nothing here" message="Log something to get started." />);
    expect(getByTestId('empty-state-title').props.children).toBe('Nothing here');
    expect(getByText('Log something to get started.')).toBeTruthy();
  });

  test('does not render an action when none is given', () => {
    const { queryByTestId } = render(<EmptyState title="Nothing here" message="..." />);
    expect(queryByTestId('empty-state-action')).toBeNull();
  });

  test('renders and fires the action when both actionLabel and onAction are given', () => {
    const onAction = jest.fn();
    const { getByTestId } = render(
      <EmptyState title="Nothing here" message="..." actionLabel="Do the thing" onAction={onAction} />,
    );
    fireEvent.press(getByTestId('empty-state-action'));
    expect(onAction).toHaveBeenCalled();
  });

  test('supports a custom testID prefix', () => {
    const { getByTestId } = render(<EmptyState testID="history-empty" title="No history" message="..." />);
    expect(getByTestId('history-empty')).toBeTruthy();
    expect(getByTestId('history-empty-title')).toBeTruthy();
  });
});
