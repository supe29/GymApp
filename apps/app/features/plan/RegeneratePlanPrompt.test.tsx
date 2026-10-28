import { fireEvent, render } from '@testing-library/react-native';
import type { PlanDiffSummary } from 'core';

import RegeneratePlanPrompt from './RegeneratePlanPrompt';

function diff(overrides: Partial<PlanDiffSummary> = {}): PlanDiffSummary {
  return {
    splitTypeChanged: false,
    previousSplitType: 'full_body',
    nextSplitType: 'full_body',
    sessionDiffs: [],
    summaryCounts: {
      sessionsAdded: 0,
      sessionsRemoved: 0,
      exercisesAdded: 0,
      exercisesRemoved: 0,
      prescriptionsChanged: 0,
    },
    ...overrides,
  };
}

describe('RegeneratePlanPrompt (FR-2.4)', () => {
  test('shows an empty-diff message when nothing changed', () => {
    const { getByTestId } = render(
      <RegeneratePlanPrompt diffSummary={diff()} onAccept={jest.fn()} onDecline={jest.fn()} />,
    );
    expect(getByTestId('regenerate-plan-diff-empty')).toBeTruthy();
  });

  test('shows the split-type change when one occurred', () => {
    const { getByTestId } = render(
      <RegeneratePlanPrompt
        diffSummary={diff({ splitTypeChanged: true, previousSplitType: 'full_body', nextSplitType: 'upper_lower' })}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
      />,
    );
    expect(getByTestId('regenerate-plan-diff-split').props.children.join('')).toContain('upper_lower');
  });

  test('shows per-session exercise changes', () => {
    const { getByTestId } = render(
      <RegeneratePlanPrompt
        diffSummary={diff({
          sessionDiffs: [
            {
              dayOrder: 1,
              name: 'Full Body',
              changeType: 'modified',
              exerciseChanges: [
                { exerciseId: 'ex-1', exerciseName: 'Squat', changeType: 'added' },
                { exerciseId: 'ex-2', exerciseName: 'Bench Press', changeType: 'removed' },
              ],
            },
          ],
          summaryCounts: {
            sessionsAdded: 0,
            sessionsRemoved: 0,
            exercisesAdded: 1,
            exercisesRemoved: 1,
            prescriptionsChanged: 0,
          },
        })}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
      />,
    );
    expect(getByTestId('regenerate-plan-diff-session-1')).toBeTruthy();
  });

  test('pressing accept calls onAccept', () => {
    const onAccept = jest.fn();
    const { getByTestId } = render(
      <RegeneratePlanPrompt diffSummary={diff()} onAccept={onAccept} onDecline={jest.fn()} />,
    );
    fireEvent.press(getByTestId('regenerate-accept'));
    expect(onAccept).toHaveBeenCalled();
  });

  test('pressing decline calls onDecline', () => {
    const onDecline = jest.fn();
    const { getByTestId } = render(
      <RegeneratePlanPrompt diffSummary={diff()} onAccept={jest.fn()} onDecline={onDecline} />,
    );
    fireEvent.press(getByTestId('regenerate-decline'));
    expect(onDecline).toHaveBeenCalled();
  });

  test('accept button reflects the accepting state', () => {
    const { getByText } = render(
      <RegeneratePlanPrompt diffSummary={diff()} onAccept={jest.fn()} onDecline={jest.fn()} accepting />,
    );
    expect(getByText('Regenerating…')).toBeTruthy();
  });
});
