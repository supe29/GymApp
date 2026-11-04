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
const mockShowSide = jest.fn();
jest.mock('three-model', () => {
  const react = jest.requireActual('react');
  const rn = jest.requireActual('react-native');
  return {
    DemoFigure: (props: { clip: string | null; paused?: boolean }) =>
      react.createElement(rn.View, { testID: 'mock-demo-figure', clip: props.clip, paused: props.paused }),
    BodyModel: react.forwardRef(
      (
        props: {
          onSelectionChange?: (id: string | null) => void;
          activeExerciseMuscles?: { primary: readonly string[]; secondary: readonly string[] } | null;
        },
        ref: unknown,
      ) => {
        react.useImperativeHandle(ref, () => ({ reset: mockReset, showSide: mockShowSide }));
        return react.createElement(rn.Pressable, {
          testID: 'mock-body-model',
          // Not a real Pressable prop — forwarded only so tests can assert
          // what MuscleExplorerScreen is passing down via .props below.
          activeExerciseMuscles: props.activeExerciseMuscles,
          onPress: () => props.onSelectionChange?.('chest'),
        });
      },
    ),
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
    id: 'ex-3',
    name: 'Barbell Squat',
    instructions: null,
    difficulty: 'beginner' as const,
    primaryMuscleKeys: ['chest'],
    secondaryMuscleKeys: [],
    requiredEquipmentKeys: ['barbell'],
  },
  {
    id: 'ex-1',
    name: 'Barbell Bench Press',
    instructions: null,
    difficulty: 'beginner' as const,
    primaryMuscleKeys: ['chest'],
    secondaryMuscleKeys: ['lats'],
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

  test('the Front/Back buttons turn the model and track which side is shown', async () => {
    const { getByTestId } = await renderLoaded();
    expect(getByTestId('muscle-explorer-side-front').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(getByTestId('muscle-explorer-side-back'));

    expect(mockShowSide).toHaveBeenLastCalledWith('back');
    expect(getByTestId('muscle-explorer-side-back').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(getByTestId('muscle-explorer-reset'));
    expect(getByTestId('muscle-explorer-side-front').props.accessibilityState).toEqual({ selected: true });
  });

  test('credits the 3D model\'s CC BY-SA sources in the 3D view', async () => {
    const { getByTestId } = await renderLoaded({ equipmentIds: ['eq-barbell'] });
    const credit = getByTestId('muscle-explorer-model-credit').props.children as string;
    expect(credit).toContain('Z-Anatomy (CC BY-SA 4.0)');
    expect(credit).toContain('BodyParts3D');
  });

  test('shows a tap hint until a muscle is selected, and a primary/secondary legend for an active exercise', async () => {
    const { getByTestId, queryByTestId } = await renderLoaded({ equipmentIds: ['eq-barbell'] });
    expect(getByTestId('muscle-explorer-hint')).toBeTruthy();
    expect(queryByTestId('muscle-explorer-legend')).toBeNull();

    fireEvent.press(getByTestId('mock-body-model'));
    await waitFor(() => expect(getByTestId('muscle-explorer-exercise-ex-1')).toBeTruthy());
    expect(queryByTestId('muscle-explorer-hint')).toBeNull();

    fireEvent.press(getByTestId('muscle-explorer-exercise-ex-1'));
    expect(getByTestId('muscle-explorer-legend')).toBeTruthy();
  });

  test('tapping an exercise row passes its primary/secondary muscles to the 3D model as activeExerciseMuscles', async () => {
    const { getByTestId } = await renderLoaded({ equipmentIds: ['eq-barbell'] });

    fireEvent.press(getByTestId('mock-body-model'));
    await waitFor(() => expect(getByTestId('muscle-explorer-exercise-ex-1')).toBeTruthy());

    fireEvent.press(getByTestId('muscle-explorer-exercise-ex-1'));

    expect(getByTestId('mock-body-model').props.activeExerciseMuscles).toEqual({
      primary: ['chest'],
      secondary: ['lats'],
    });
    expect(getByTestId('muscle-explorer-exercise-ex-1').props.accessibilityState).toEqual({ selected: true });
  });

  test('shows no demo figure until an exercise is chosen, then plays its clip with pause control', async () => {
    const { getByTestId, queryByTestId } = await renderLoaded({ equipmentIds: ['eq-barbell'] });
    fireEvent.press(getByTestId('mock-body-model'));
    await waitFor(() => expect(getByTestId('muscle-explorer-exercise-ex-3')).toBeTruthy());
    expect(queryByTestId('mock-demo-figure')).toBeNull();

    fireEvent.press(getByTestId('muscle-explorer-exercise-ex-3'));
    expect(getByTestId('mock-demo-figure').props.clip).toBe('squat');
    expect(getByTestId('mock-demo-figure').props.paused).toBe(false);

    fireEvent.press(getByTestId('muscle-explorer-demo-pause'));
    expect(getByTestId('mock-demo-figure').props.paused).toBe(true);
  });

  test('an exercise with no matching motion shows the standing figure and says there is no demo', async () => {
    const { getByTestId, queryByTestId } = await renderLoaded({ equipmentIds: ['eq-barbell'] });
    fireEvent.press(getByTestId('mock-body-model'));
    await waitFor(() => expect(getByTestId('muscle-explorer-exercise-ex-1')).toBeTruthy());

    fireEvent.press(getByTestId('muscle-explorer-exercise-ex-1'));

    expect(getByTestId('mock-demo-figure').props.clip).toBeNull();
    expect(queryByTestId('muscle-explorer-demo-pause')).toBeNull();
    expect(getByTestId('muscle-explorer-demo-note').props.children).toContain('No movement demo');
  });

  test('selecting a different region on the model clears the active exercise', async () => {
    const { getByTestId } = await renderLoaded({ equipmentIds: ['eq-barbell'] });

    fireEvent.press(getByTestId('mock-body-model')); // selects 'chest', filters the list
    await waitFor(() => expect(getByTestId('muscle-explorer-exercise-ex-1')).toBeTruthy());
    fireEvent.press(getByTestId('muscle-explorer-exercise-ex-1')); // activates it
    expect(getByTestId('mock-body-model').props.activeExerciseMuscles).not.toBeNull();

    fireEvent.press(getByTestId('mock-body-model')); // tap a region again -> should clear

    expect(getByTestId('mock-body-model').props.activeExerciseMuscles).toBeNull();
  });

  test('the reset button clears the active exercise alongside the camera', async () => {
    const { getByTestId } = await renderLoaded({ equipmentIds: ['eq-barbell'] });

    fireEvent.press(getByTestId('mock-body-model'));
    await waitFor(() => expect(getByTestId('muscle-explorer-exercise-ex-1')).toBeTruthy());
    fireEvent.press(getByTestId('muscle-explorer-exercise-ex-1'));
    expect(getByTestId('mock-body-model').props.activeExerciseMuscles).not.toBeNull();

    fireEvent.press(getByTestId('muscle-explorer-reset'));

    expect(mockReset).toHaveBeenCalled();
    expect(getByTestId('mock-body-model').props.activeExerciseMuscles).toBeNull();
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
