import { fireEvent, render } from '@testing-library/react-native';

import ProgressionSuggestionCard from './ProgressionSuggestionCard';

const baseProps = {
  exerciseId: 'ex-1',
  exerciseName: 'Squat',
  action: 'increase_weight' as const,
  suggestedWeightKg: 52.5,
  suggestedReps: 8,
  rationale: 'You hit 12+ reps on every set last time.',
  onAccept: jest.fn(),
  onDecline: jest.fn(),
  onOverride: jest.fn(),
};

describe('ProgressionSuggestionCard (FR-6.2/FR-6.3)', () => {
  afterEach(() => jest.clearAllMocks());

  test('FR-6.3: always shows the plain-language rationale', () => {
    const { getByTestId } = render(<ProgressionSuggestionCard {...baseProps} />);
    expect(getByTestId('progression-card-ex-1-rationale').props.children).toBe(baseProps.rationale);
  });

  test('shows the suggested action and values', () => {
    const { getByTestId } = render(<ProgressionSuggestionCard {...baseProps} />);
    const text = getByTestId('progression-card-ex-1-action').props.children.join('');
    expect(text).toContain('Increase weight');
    expect(text).toContain('52.5kg');
    expect(text).toContain('8 reps');
  });

  test('pressing accept calls onAccept', () => {
    const onAccept = jest.fn();
    const { getByTestId } = render(<ProgressionSuggestionCard {...baseProps} onAccept={onAccept} />);
    fireEvent.press(getByTestId('progression-card-ex-1-accept'));
    expect(onAccept).toHaveBeenCalled();
  });

  test('pressing decline calls onDecline', () => {
    const onDecline = jest.fn();
    const { getByTestId } = render(<ProgressionSuggestionCard {...baseProps} onDecline={onDecline} />);
    fireEvent.press(getByTestId('progression-card-ex-1-decline'));
    expect(onDecline).toHaveBeenCalled();
  });

  test('FR-6.2: override reveals steppers pre-filled with the suggested values, adjustable, and confirms with onOverride', () => {
    const onOverride = jest.fn();
    const { getByTestId } = render(<ProgressionSuggestionCard {...baseProps} onOverride={onOverride} />);

    fireEvent.press(getByTestId('progression-card-ex-1-override-toggle'));
    expect(getByTestId('progression-card-ex-1-override-weight-value').props.value).toBe('52.5');
    expect(getByTestId('progression-card-ex-1-override-reps-value').props.value).toBe('8');

    fireEvent.press(getByTestId('progression-card-ex-1-override-weight-inc'));
    fireEvent.press(getByTestId('progression-card-ex-1-override-reps-dec'));
    fireEvent.press(getByTestId('progression-card-ex-1-override-confirm'));

    expect(onOverride).toHaveBeenCalledWith(55, 7);
  });

  test('override is available even for a hold suggestion (user prerogative, not an SR-4 violation)', () => {
    const { getByTestId } = render(
      <ProgressionSuggestionCard {...baseProps} action="hold" suggestedWeightKg={50} suggestedReps={null} />,
    );
    expect(getByTestId('progression-card-ex-1-override-toggle')).toBeTruthy();
  });

  test('once resolved, shows a resolved label instead of action buttons', () => {
    const { getByTestId, queryByTestId } = render(<ProgressionSuggestionCard {...baseProps} status="accepted" />);
    expect(getByTestId('progression-card-ex-1-resolved').props.children).toBe('Accepted');
    expect(queryByTestId('progression-card-ex-1-accept')).toBeNull();
  });
});
