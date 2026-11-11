import { fireEvent, render } from '@testing-library/react-native';

import ExerciseDemoPanel, { DemoModelCredit } from './ExerciseDemoPanel';

jest.mock('three-model', () => {
  const react = jest.requireActual('react');
  const rn = jest.requireActual('react-native');
  return {
    DemoFigure: (props: { clip: string | null; paused?: boolean; muscles?: unknown }) =>
      react.createElement(rn.View, { testID: 'mock-demo-figure', clip: props.clip, paused: props.paused, muscles: props.muscles }),
  };
});

describe('ExerciseDemoPanel', () => {
  test('plays the exercise clip with its muscles lit, and pauses', () => {
    const muscles = { primary: ['quadriceps'], secondary: ['glutes'] };
    const { getByTestId, queryByTestId } = render(<ExerciseDemoPanel exerciseName="Barbell Squat" muscles={muscles} testID="demo" />);

    const figure = getByTestId('mock-demo-figure');
    expect(figure.props.clip).toBe('squat');
    expect(figure.props.paused).toBe(false);
    expect(figure.props.muscles).toBe(muscles);
    // A clip that matches the exercise needs no note under it.
    expect(queryByTestId('demo-note')).toBeNull();
    expect(queryByTestId('demo-model-credit')).toBeNull();

    fireEvent.press(getByTestId('demo-pause'));
    expect(getByTestId('mock-demo-figure').props.paused).toBe(true);
  });

  test('an exercise with no clip shows the rest pose, no pause button, and says so', () => {
    const { getByTestId, queryByTestId } = render(<ExerciseDemoPanel exerciseName="Made-up exercise" testID="demo" />);

    expect(getByTestId('mock-demo-figure').props.clip).toBeNull();
    expect(queryByTestId('demo-pause')).toBeNull();
    expect(getByTestId('demo-note').props.children).toContain('No movement demo');
  });

  test('shows the clip note when the demo differs from the exercise', () => {
    const { getByTestId } = render(<ExerciseDemoPanel exerciseName="Bench Press - With Bands" testID="demo" />);
    expect(getByTestId('demo-note').props.children).toBe('Bands not shown.');
  });

  test('DemoModelCredit shows the mesh licence credit', () => {
    const { getByTestId } = render(<DemoModelCredit />);
    expect(getByTestId('demo-model-credit').props.children).toContain('Z-Anatomy');
  });

  test('a 3D view that fails to start shows a message instead of crashing the screen', () => {
    const threeModel = jest.requireMock('three-model') as { DemoFigure: unknown };
    const original = threeModel.DemoFigure;
    threeModel.DemoFigure = () => {
      throw new Error('Error creating WebGL context.');
    };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { getByTestId } = render(<ExerciseDemoPanel exerciseName="Barbell Squat" testID="demo" />);
      expect(getByTestId('demo-unavailable')).toBeTruthy();
      expect(getByTestId('demo-unavailable-reason').props.children).toBe('Error creating WebGL context.');
    } finally {
      threeModel.DemoFigure = original;
      consoleError.mockRestore();
    }
  });
});
