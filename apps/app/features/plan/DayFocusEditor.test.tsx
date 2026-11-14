import { fireEvent, render } from '@testing-library/react-native';

import DayFocusEditor from './DayFocusEditor';

function renderEditor(props: Partial<React.ComponentProps<typeof DayFocusEditor>> = {}) {
  const onPreview = jest.fn();
  const utils = render(
    <DayFocusEditor
      weekdays={[1, 2, 4, 5]}
      goal="general_fitness"
      fitnessLevel="beginner"
      current={null}
      onPreview={onPreview}
      onCancel={jest.fn()}
      {...props}
    />,
  );
  return { ...utils, onPreview };
}

const checked = (el: { props: { accessibilityState?: { checked?: boolean; selected?: boolean } } }) =>
  el.props.accessibilityState?.checked ?? el.props.accessibilityState?.selected;

describe('DayFocusEditor (FR-2.7)', () => {
  test('starts on the recommendation: back-to-back days split Upper/Lower, with a reason per day', () => {
    const { getByTestId, getAllByText } = renderEditor();
    expect(checked(getByTestId('plan-split-auto'))).toBe(true);
    expect(checked(getByTestId('plan-focus-day-1-upper'))).toBe(true);
    expect(checked(getByTestId('plan-focus-day-2-lower'))).toBe(true);
    expect(checked(getByTestId('plan-focus-day-1-core'))).toBe(true);
    // Tue and Fri both follow an Upper day.
    expect(getAllByText('Lower, the day after Upper, so those muscles get a rest.')).toHaveLength(2);
  });

  test('picking a named split fills the days and previews that split', () => {
    const { getByTestId, onPreview } = renderEditor();
    fireEvent.press(getByTestId('plan-split-push_pull_legs'));

    expect(checked(getByTestId('plan-focus-day-1-push'))).toBe(true);
    expect(checked(getByTestId('plan-focus-day-2-pull'))).toBe(true);
    expect(checked(getByTestId('plan-focus-day-4-legs'))).toBe(true);

    fireEvent.press(getByTestId('plan-day-focus-preview'));
    expect(onPreview).toHaveBeenCalledWith({ split: 'push_pull_legs' });
  });

  test('editing a day switches to Custom: Pull + Legs on Tuesday, core on Thursday', () => {
    const { getByTestId, onPreview, queryByText } = renderEditor();
    fireEvent.press(getByTestId('plan-split-push_pull_legs'));
    fireEvent.press(getByTestId('plan-focus-day-2-legs')); // Tue: Pull -> Pull + Legs
    fireEvent.press(getByTestId('plan-focus-day-4-core')); // Thu: add core

    expect(checked(getByTestId('plan-split-custom'))).toBe(true);
    expect(queryByText('You chose Push/Pull/Legs.')).toBeNull();
    fireEvent.press(getByTestId('plan-day-focus-preview'));
    expect(onPreview).toHaveBeenCalledWith({
      split: 'custom',
      days: [
        { focus: ['push'], core: true },
        { focus: ['pull', 'legs'], core: false },
        { focus: ['legs'], core: true },
        { focus: ['push'], core: true },
      ],
    });
  });

  test('a day keeps at least one focus, and a third pick replaces the older of two', () => {
    const { getByTestId } = renderEditor();
    fireEvent.press(getByTestId('plan-focus-day-1-upper')); // only focus: stays on
    expect(checked(getByTestId('plan-focus-day-1-upper'))).toBe(true);

    fireEvent.press(getByTestId('plan-focus-day-1-push')); // Upper + Push
    fireEvent.press(getByTestId('plan-focus-day-1-pull')); // replaces Upper -> Push + Pull
    expect(checked(getByTestId('plan-focus-day-1-upper'))).toBe(false);
    expect(checked(getByTestId('plan-focus-day-1-push'))).toBe(true);
    expect(checked(getByTestId('plan-focus-day-1-pull'))).toBe(true);
  });

  test('warns (without blocking) when back-to-back days work mostly the same muscles', () => {
    const { getByTestId, queryByTestId, onPreview } = renderEditor();
    expect(queryByTestId('plan-focus-day-2-warning')).toBeNull();

    fireEvent.press(getByTestId('plan-split-full_body'));
    expect(getByTestId('plan-focus-day-2-warning').props.children).toContain('Mon, the day before');

    fireEvent.press(getByTestId('plan-day-focus-preview'));
    expect(onPreview).toHaveBeenCalledWith({ split: 'full_body' });
  });

  test('opens on the stored preference', () => {
    const { getByTestId } = renderEditor({
      current: {
        split: 'custom',
        days: [
          { focus: ['push'], core: true },
          { focus: ['pull', 'legs'], core: false },
          { focus: ['upper'], core: false },
          { focus: ['lower'], core: true },
        ],
      },
    });
    expect(checked(getByTestId('plan-split-custom'))).toBe(true);
    expect(checked(getByTestId('plan-focus-day-2-pull'))).toBe(true);
    expect(checked(getByTestId('plan-focus-day-2-legs'))).toBe(true);
    expect(checked(getByTestId('plan-focus-day-5-core'))).toBe(true);
  });
});
