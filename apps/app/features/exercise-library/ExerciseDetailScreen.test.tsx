import { render } from '@testing-library/react-native';
import type { ExerciseWithTags } from 'core';

import ExerciseDetailScreen from './ExerciseDetailScreen';

const benchPress: ExerciseWithTags = {
  id: 'ex-1',
  name: 'Barbell Bench Press',
  instructions: 'Lie on the bench.\nPress up.',
  difficulty: 'beginner',
  primaryMuscleKeys: ['chest'],
  secondaryMuscleKeys: ['shoulders', 'triceps'],
  requiredEquipmentKeys: ['barbell'],
};

const pushup: ExerciseWithTags = {
  id: 'ex-2',
  name: 'Push-Up',
  instructions: null,
  difficulty: 'beginner',
  primaryMuscleKeys: ['chest'],
  secondaryMuscleKeys: [],
  requiredEquipmentKeys: [],
};

describe('ExerciseDetailScreen (FR-4.3)', () => {
  test('shows the exercise name, difficulty, and raw muscle/equipment keys with no display-name maps', () => {
    const { getByText, getByTestId } = render(<ExerciseDetailScreen exercise={benchPress} />);

    expect(getByText('Barbell Bench Press')).toBeTruthy();
    expect(getByTestId('exercise-detail-difficulty').props.children).toBe('beginner');
    expect(getByTestId('exercise-detail-primary-muscles').props.children).toBe('chest');
    expect(getByTestId('exercise-detail-secondary-muscles').props.children).toBe(
      'shoulders, triceps',
    );
    expect(getByTestId('exercise-detail-equipment').props.children).toBe('barbell');
  });

  test('uses display-name maps when provided', () => {
    const { getByTestId } = render(
      <ExerciseDetailScreen
        exercise={benchPress}
        muscleDisplayNames={{ chest: 'Chest', shoulders: 'Shoulders', triceps: 'Triceps' }}
        equipmentDisplayNames={{ barbell: 'Barbell' }}
      />,
    );

    expect(getByTestId('exercise-detail-primary-muscles').props.children).toBe('Chest');
    expect(getByTestId('exercise-detail-secondary-muscles').props.children).toBe(
      'Shoulders, Triceps',
    );
    expect(getByTestId('exercise-detail-equipment').props.children).toBe('Barbell');
  });

  test('shows placeholders for an exercise with no secondary muscles, no equipment, and no instructions', () => {
    const { getByTestId, queryByTestId } = render(<ExerciseDetailScreen exercise={pushup} />);

    expect(getByTestId('exercise-detail-secondary-muscles').props.children).toBe('—');
    expect(getByTestId('exercise-detail-equipment').props.children).toBe('None (bodyweight)');
    expect(queryByTestId('exercise-detail-instructions')).toBeNull();
  });
});
