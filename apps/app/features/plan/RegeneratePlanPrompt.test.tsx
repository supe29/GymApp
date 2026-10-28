import { fireEvent, render } from '@testing-library/react-native';
import type { NutritionTargetDiffSummary, PlanDiffSummary } from 'core';

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

function nutritionDiff(overrides: Partial<NutritionTargetDiffSummary> = {}): NutritionTargetDiffSummary {
  return {
    changed: false,
    previous: { dailyCalories: 2000, proteinG: 150, carbsG: 200, fatG: 55 },
    next: { dailyCalories: 2000, proteinG: 150, carbsG: 200, fatG: 55 },
    deltas: { dailyCalories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
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

  test('nutrition-only mode: shows the nutrition diff and no plan diff section', () => {
    const { getByTestId, queryByTestId } = render(
      <RegeneratePlanPrompt
        nutritionDiffSummary={nutritionDiff({
          changed: true,
          next: { dailyCalories: 1800, proteinG: 150, carbsG: 170, fatG: 50 },
          deltas: { dailyCalories: -200, proteinG: 0, carbsG: -30, fatG: -5 },
        })}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
      />,
    );
    expect(getByTestId('regenerate-nutrition-diff')).toBeTruthy();
    expect(getByTestId('regenerate-nutrition-diff-calories').props.children.join('')).toContain('1800');
    expect(queryByTestId('regenerate-plan-diff-split')).toBeNull();
  });

  test('nutrition-only mode: empty-diff message shown when nothing changed', () => {
    const { getByTestId, queryByTestId } = render(
      <RegeneratePlanPrompt nutritionDiffSummary={nutritionDiff()} onAccept={jest.fn()} onDecline={jest.fn()} />,
    );
    expect(getByTestId('regenerate-plan-diff-empty')).toBeTruthy();
    expect(queryByTestId('regenerate-nutrition-diff')).toBeNull();
  });

  test('nutrition-only mode: first-ever targets (no previous) render without crashing', () => {
    const { getByTestId } = render(
      <RegeneratePlanPrompt
        nutritionDiffSummary={nutritionDiff({
          changed: true,
          previous: null,
          next: { dailyCalories: 2200, proteinG: 160, carbsG: 220, fatG: 60 },
          deltas: { dailyCalories: 2200, proteinG: 160, carbsG: 220, fatG: 60 },
        })}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
      />,
    );
    expect(getByTestId('regenerate-nutrition-diff-calories').props.children.join('')).toContain('2200');
  });

  test('combined mode: shows both plan and nutrition diff sections and a single accept/decline', () => {
    const onAccept = jest.fn();
    const { getByTestId } = render(
      <RegeneratePlanPrompt
        diffSummary={diff({ splitTypeChanged: true, previousSplitType: 'full_body', nextSplitType: 'upper_lower' })}
        nutritionDiffSummary={nutritionDiff({
          changed: true,
          next: { dailyCalories: 1800, proteinG: 150, carbsG: 170, fatG: 50 },
          deltas: { dailyCalories: -200, proteinG: 0, carbsG: -30, fatG: -5 },
        })}
        onAccept={onAccept}
        onDecline={jest.fn()}
      />,
    );
    expect(getByTestId('regenerate-plan-diff-split')).toBeTruthy();
    expect(getByTestId('regenerate-nutrition-diff')).toBeTruthy();

    fireEvent.press(getByTestId('regenerate-accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});
