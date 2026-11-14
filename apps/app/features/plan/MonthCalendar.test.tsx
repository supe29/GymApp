import { fireEvent, render } from '@testing-library/react-native';
import { buildMonthSchedule, type ScheduleSession } from 'core';

import MonthCalendar from './MonthCalendar';

const A: ScheduleSession = { id: 'A', dayOrder: 1, name: 'Push', exerciseIds: ['bench'] };
const B: ScheduleSession = {
  id: 'B',
  dayOrder: 2,
  name: 'Pull + Legs + Core',
  exerciseIds: ['row'],
};

const schedule = buildMonthSchedule({
  sessions: [A, B],
  weekdays: [1, 4],
  year: 2026,
  month: 11,
  today: '2026-11-11',
  completed: [{ plannedSessionId: null, completedAt: new Date(2026, 10, 7, 10).toISOString() }],
  adjustments: [
    {
      weekStart: '2026-11-02',
      plannedSessionId: 'B',
      action: 'skip',
      targetDate: null,
      mergeIntoPlannedSessionId: null,
    },
  ],
  planStart: null,
});

function renderCalendar(overrides: Partial<React.ComponentProps<typeof MonthCalendar>> = {}) {
  const props = {
    schedule,
    today: '2026-11-11',
    isCurrent: true,
    onPrev: jest.fn(),
    onNext: jest.fn(),
    onThisMonth: jest.fn(),
    onSelectDay: jest.fn(),
    ...overrides,
  };
  return { ...render(<MonthCalendar {...props} />), props };
}

describe('MonthCalendar (FR-2.8/AC-21)', () => {
  test('renders a Monday-first grid with focus, status marks and accessible labels', () => {
    const { getByTestId, queryByTestId } = renderCalendar();

    expect(getByTestId('plan-month-day-2026-10-26')).toBeTruthy();
    expect(getByTestId('plan-month-day-2026-12-06')).toBeTruthy();
    expect(getByTestId('plan-month-day-2026-11-05-focus').props.children).toBe(
      'Pull + Legs + Core',
    );
    expect(getByTestId('plan-month-day-2026-11-05-mark').props.children).toBe('–');
    expect(getByTestId('plan-month-day-2026-11-05').props.accessibilityLabel).toContain(
      'Pull + Legs + Core, skipped',
    );
    // A workout logged on a rest day still gets a mark, without a focus.
    expect(getByTestId('plan-month-day-2026-11-07-mark').props.children).toBe('●');
    expect(queryByTestId('plan-month-day-2026-11-07-focus')).toBeNull();
    expect(getByTestId('plan-month-day-2026-11-11').props.accessibilityLabel).toContain('(today)');
    expect(queryByTestId('plan-month-current')).toBeNull();
  });

  test('navigates and reports the tapped day', () => {
    const { getByTestId, props } = renderCalendar({ isCurrent: false });

    fireEvent.press(getByTestId('plan-month-prev'));
    fireEvent.press(getByTestId('plan-month-next'));
    fireEvent.press(getByTestId('plan-month-current'));
    fireEvent.press(getByTestId('plan-month-day-2026-11-19'));

    expect(props.onPrev).toHaveBeenCalledTimes(1);
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(props.onThisMonth).toHaveBeenCalledTimes(1);
    expect(props.onSelectDay).toHaveBeenCalledWith('2026-11-19');
  });
});
