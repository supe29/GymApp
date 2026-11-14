import { fireEvent, render } from '@testing-library/react-native';
import type { ExerciseWithTags } from 'core';

import ExercisePicker from './ExercisePicker';

function exercise(id: string, name: string, primary: string[]): ExerciseWithTags {
  return { id, name, instructions: null, difficulty: 'beginner', primaryMuscleKeys: primary, secondaryMuscleKeys: [], requiredEquipmentKeys: [] };
}

const EXERCISES = [
  exercise('bench', 'Barbell Bench Press', ['chest']),
  exercise('squat', 'Barbell Squat', ['quadriceps']),
  exercise('row', 'Seated Cable Row', ['middle_back']),
];

describe('ExercisePicker (FR-5.3)', () => {
  test('lists every exercise until the user types, then narrows live', () => {
    const { getByTestId, queryByTestId } = render(<ExercisePicker exercises={EXERCISES} onSelect={jest.fn()} testIDPrefix="p" />);
    expect(getByTestId('p-option-bench')).toBeTruthy();
    expect(getByTestId('p-option-squat')).toBeTruthy();

    fireEvent.changeText(getByTestId('p-search'), 'bench');

    expect(getByTestId('p-option-bench')).toBeTruthy();
    expect(queryByTestId('p-option-squat')).toBeNull();
    expect(queryByTestId('p-option-row')).toBeNull();
  });

  test('finds exercises by muscle, and shows their muscles', () => {
    const { getByTestId, queryByTestId, getByText } = render(<ExercisePicker exercises={EXERCISES} onSelect={jest.fn()} testIDPrefix="p" />);
    fireEvent.changeText(getByTestId('p-search'), 'middle back');
    expect(getByTestId('p-option-row')).toBeTruthy();
    expect(queryByTestId('p-option-bench')).toBeNull();
    expect(getByText('middle back')).toBeTruthy();
  });

  test('selecting a result calls onSelect with it', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(<ExercisePicker exercises={EXERCISES} onSelect={onSelect} testIDPrefix="p" />);
    fireEvent.press(getByTestId('p-option-squat'));
    expect(onSelect).toHaveBeenCalledWith(EXERCISES[1]);
  });

  test('says when nothing matches, and clearing the search brings the list back', () => {
    const { getByTestId } = render(<ExercisePicker exercises={EXERCISES} onSelect={jest.fn()} testIDPrefix="p" />);
    fireEvent.changeText(getByTestId('p-search'), 'zzz');
    expect(getByTestId('p-no-results').props.children).toBe('No exercises match “zzz”.');

    fireEvent.press(getByTestId('p-search-clear'));
    expect(getByTestId('p-option-bench')).toBeTruthy();
  });

  test('caps the list and says how many matched', () => {
    const { getByTestId, queryByTestId } = render(<ExercisePicker exercises={EXERCISES} onSelect={jest.fn()} testIDPrefix="p" limit={2} />);
    expect(queryByTestId('p-option-row')).toBeNull();
    expect(getByTestId('p-more').props.children).toBe('Showing 2 of 3. Keep typing to narrow.');
  });
});
