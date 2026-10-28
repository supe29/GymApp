import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';

import MuscleExplorerScreen from './MuscleExplorerScreen';

jest.mock('api-client', () => ({
  listMuscleGroups: jest.fn(),
  getExercisesWithTags: jest.fn(),
  getUserEquipmentIds: jest.fn(),
  listEquipmentItems: jest.fn(),
}));

// BodyModel needs a real WebGL/native GL context (@react-three/fiber +
// expo-gl), neither of which exists in this Jest environment — see
// packages/three-model's own test suite (interactionContract, gestureMath,
// parity) for what IS actually executed for that component. Here we mock
// it entirely so this test verifies MuscleExplorerScreen's own wiring
// (data loading, view-mode toggle, equipment-filtered exercise list,
// reset-button plumbing) treating BodyModel as an opaque, already-tested
// unit — exactly the intended test boundary.
const mockReset = jest.fn();
jest.mock('three-model', () => {
  const react = jest.requireActual('react');
  const rn = jest.requireActual('react-native');
  return {
    BodyModel: react.forwardRef((props: { onSelectionChange?: (id: string | null) => void }, ref: unknown) => {
      react.useImperativeHandle(ref, () => ({ reset: mockReset }));
      return react.createElement(rn.Pressable, {
        testID: 'mock-body-model',
        onPress: () => props.onSelectionChange?.('chest'),
      });
    }),
  };
});

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

const muscleGroups = [
  { id: 'g1', key: 'chest', display_name: 'Chest', created_at: '' },
  { id: 'g2', key: 'lats', display_name: 'Lats', created_at: '' },
];

const exercises = [
  {
    id: 'ex-1',
    name: 'Barbell Bench Press',
    instructions: null,
    difficulty: 'beginner' as const,
    primaryMuscleKeys: ['chest'],
    secondaryMuscleKeys: [],
    requiredEquipmentKeys: ['barbell'],
  },
  {
    id: 'ex-2',
    name: 'Push-Up',
    instructions: null,
    difficulty: 'beginner' as const,
    primaryMuscleKeys: ['chest'],
    secondaryMuscleKeys: [],
    requiredEquipmentKeys: [],
  },
];

async function renderLoaded(overrides: { equipmentIds?: string[] } = {}) {
  mockedApiClient.listMuscleGroups.mockResolvedValue({ data: muscleGroups, error: null });
  mockedApiClient.getExercisesWithTags.mockResolvedValue({ data: exercises, error: null });
  mockedApiClient.getUserEquipmentIds.mockResolvedValue({
    data: overrides.equipmentIds ?? [],
    error: null,
  });
  mockedApiClient.listEquipmentItems.mockResolvedValue({
    data: [{ id: 'eq-barbell', key: 'barbell', display_name: 'Barbell', category: 'free_weights' as const, created_at: '' }],
    error: null,
  });

  const utils = render(<MuscleExplorerScreen client={fakeClient} userId="user-1" />);
  await waitFor(() => expect(mockedApiClient.getExercisesWithTags).toHaveBeenCalled());
  return utils;
}

describe('MuscleExplorerScreen (FR-4.1/FR-4.2/FR-4.4/UX-5/NFR-5)', () => {
  afterEach(() => jest.clearAllMocks());

  test('selecting a region via the 3D model shows exercises for that muscle, filtered by equipment', async () => {
    const { getByTestId, queryByTestId } = await renderLoaded({ equipmentIds: [] });

    fireEvent.press(getByTestId('mock-body-model'));

    await waitFor(() => expect(getByTestId('muscle-explorer-exercise-list')).toBeTruthy());
    // No equipment declared -> only the bodyweight Push-Up should appear, not the barbell exercise.
    expect(getByTestId('muscle-explorer-exercise-ex-2')).toBeTruthy();
    expect(queryByTestId('muscle-explorer-exercise-ex-1')).toBeNull();
  });

  test('declaring the required equipment makes the equipment-gated exercise appear too', async () => {
    const { getByTestId } = await renderLoaded({ equipmentIds: ['eq-barbell'] });

    fireEvent.press(getByTestId('mock-body-model'));

    await waitFor(() => expect(getByTestId('muscle-explorer-exercise-ex-1')).toBeTruthy());
    expect(getByTestId('muscle-explorer-exercise-ex-2')).toBeTruthy();
  });

  test('the list view fallback is always reachable via the toggle, not hidden behind the 3D view (UX-5/NFR-5)', async () => {
    const { getByTestId, queryByTestId } = await renderLoaded();

    expect(getByTestId('muscle-explorer-toggle-list')).toBeTruthy();
    fireEvent.press(getByTestId('muscle-explorer-toggle-list'));

    expect(getByTestId('muscle-list-fallback')).toBeTruthy();
    expect(queryByTestId('mock-body-model')).toBeNull();
  });

  test('selecting a muscle from the list fallback produces the same exercise list as the 3D path (functional equivalence, AC-5)', async () => {
    const { getByTestId } = await renderLoaded({ equipmentIds: ['eq-barbell'] });

    fireEvent.press(getByTestId('muscle-explorer-toggle-list'));
    fireEvent.press(getByTestId('muscle-list-item-chest'));

    await waitFor(() => expect(getByTestId('muscle-explorer-exercise-ex-1')).toBeTruthy());
    expect(getByTestId('muscle-explorer-exercise-ex-2')).toBeTruthy();
  });

  test('the reset button calls the BodyModel handle\'s reset method', async () => {
    const { getByTestId } = await renderLoaded();

    fireEvent.press(getByTestId('muscle-explorer-reset'));

    expect(mockReset).toHaveBeenCalled();
  });

  test('shows an empty state when no exercises match the selected muscle and equipment', async () => {
    mockedApiClient.listMuscleGroups.mockResolvedValue({ data: muscleGroups, error: null });
    mockedApiClient.getExercisesWithTags.mockResolvedValue({ data: [], error: null });
    mockedApiClient.getUserEquipmentIds.mockResolvedValue({ data: [], error: null });
    mockedApiClient.listEquipmentItems.mockResolvedValue({ data: [], error: null });

    const { getByTestId } = render(<MuscleExplorerScreen client={fakeClient} userId="user-1" />);
    await waitFor(() => expect(mockedApiClient.getExercisesWithTags).toHaveBeenCalled());

    fireEvent.press(getByTestId('mock-body-model'));

    await waitFor(() => expect(getByTestId('muscle-explorer-no-exercises')).toBeTruthy());
  });
});
