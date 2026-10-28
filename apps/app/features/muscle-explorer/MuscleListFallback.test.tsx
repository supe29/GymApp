import { fireEvent, render } from '@testing-library/react-native';
import type { MuscleGroupRow } from 'api-client';

import MuscleListFallback from './MuscleListFallback';

const groups: MuscleGroupRow[] = [
  { id: 'g1', key: 'chest', display_name: 'Chest', created_at: '' },
  { id: 'g2', key: 'lats', display_name: 'Lats', created_at: '' },
];

describe('MuscleListFallback (NFR-5/AC-5)', () => {
  test('renders every muscle group by display name', () => {
    const { getByText } = render(
      <MuscleListFallback muscleGroups={groups} selectedKey={null} onSelect={jest.fn()} />,
    );
    expect(getByText('Chest')).toBeTruthy();
    expect(getByText('Lats')).toBeTruthy();
  });

  test('tapping a row calls onSelect with the muscle group key', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <MuscleListFallback muscleGroups={groups} selectedKey={null} onSelect={onSelect} />,
    );

    fireEvent.press(getByTestId('muscle-list-item-lats'));

    expect(onSelect).toHaveBeenCalledWith('lats');
  });

  test('renders an empty state when there are no muscle groups', () => {
    const { getByText } = render(
      <MuscleListFallback muscleGroups={[]} selectedKey={null} onSelect={jest.fn()} />,
    );
    expect(getByText('No muscle groups available.')).toBeTruthy();
  });
});
