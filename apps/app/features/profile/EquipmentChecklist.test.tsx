import { fireEvent, render } from '@testing-library/react-native';
import type { EquipmentItemRow } from 'api-client';

import EquipmentChecklist from './EquipmentChecklist';

const items: EquipmentItemRow[] = [
  { id: 'bb', key: 'barbell', display_name: 'Barbell', category: 'free_weights', created_at: '' },
  { id: 'db', key: 'dumbbell', display_name: 'Dumbbell', category: 'free_weights', created_at: '' },
  {
    id: 'leg-press',
    key: 'leg_press',
    display_name: 'Leg Press',
    category: 'machines',
    created_at: '',
  },
  {
    id: 'bw',
    key: 'bodyweight',
    display_name: 'Bodyweight',
    category: 'bodyweight_other',
    created_at: '',
  },
];

describe('EquipmentChecklist (FR-1.2)', () => {
  test('renders items grouped by category', () => {
    const { getByText } = render(
      <EquipmentChecklist items={items} selectedIds={[]} onChange={jest.fn()} />,
    );

    expect(getByText('Free weights')).toBeTruthy();
    expect(getByText('Machines')).toBeTruthy();
    expect(getByText('Bodyweight / other')).toBeTruthy();
    expect(getByText('Barbell')).toBeTruthy();
  });

  test('toggling an item adds it to the selection', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <EquipmentChecklist items={items} selectedIds={[]} onChange={onChange} />,
    );

    fireEvent.press(getByTestId('equipment-item-bb'));

    expect(onChange).toHaveBeenCalledWith(['bb']);
  });

  test('toggling a selected item removes it', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <EquipmentChecklist items={items} selectedIds={['bb', 'db']} onChange={onChange} />,
    );

    fireEvent.press(getByTestId('equipment-item-bb'));

    expect(onChange).toHaveBeenCalledWith(['db']);
  });

  test('"Full gym" preset selects every item', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <EquipmentChecklist items={items} selectedIds={[]} onChange={onChange} />,
    );

    fireEvent.press(getByTestId('equipment-preset-full-gym'));

    expect(onChange).toHaveBeenCalledWith(['bb', 'db', 'leg-press', 'bw']);
  });

  test('"Bodyweight only" preset selects only bodyweight_other items', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <EquipmentChecklist items={items} selectedIds={['bb']} onChange={onChange} />,
    );

    fireEvent.press(getByTestId('equipment-preset-bodyweight-only'));

    expect(onChange).toHaveBeenCalledWith(['bw']);
  });
});
