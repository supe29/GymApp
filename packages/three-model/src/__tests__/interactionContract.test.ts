import {
  applyRotationDelta,
  applyZoomDelta,
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
  cameraStateToFraming,
  DEFAULT_CAMERA_STATE,
  defaultInteractionState,
  EMPTY_SELECTION,
  faceCamera,
  interactionReducer,
  PITCH_MAX,
  PITCH_MIN,
  resetCamera,
  resetSelection,
  regionIdFromMeshName,
  ZOOM_MAX,
  ZOOM_MIN,
} from '../interactionContract';

describe('rotate', () => {
  test('applies a yaw delta additively', () => {
    const result = applyRotationDelta(DEFAULT_CAMERA_STATE, 0.1, 0);
    expect(result.yaw).toBeCloseTo(0.1);
  });

  test('yaw wraps around the unit interval (360° = back to start)', () => {
    const result = applyRotationDelta({ yaw: 0.95, pitch: 0, zoom: 0.5 }, 0.1, 0);
    expect(result.yaw).toBeCloseTo(0.05);
  });

  test('yaw wraps correctly for negative deltas too', () => {
    const result = applyRotationDelta({ yaw: 0.05, pitch: 0, zoom: 0.5 }, -0.1, 0);
    expect(result.yaw).toBeCloseTo(0.95);
  });

  test('pitch is clamped to PITCH_MIN/PITCH_MAX, never flips past them', () => {
    const up = applyRotationDelta(DEFAULT_CAMERA_STATE, 0, 10);
    expect(up.pitch).toBe(PITCH_MAX);
    const down = applyRotationDelta(DEFAULT_CAMERA_STATE, 0, -10);
    expect(down.pitch).toBe(PITCH_MIN);
  });

  test('does not mutate the input state', () => {
    const frozen = Object.freeze({ yaw: 0, pitch: 0, zoom: 0.5 });
    applyRotationDelta(frozen, 0.2, 0.1);
    expect(frozen).toEqual({ yaw: 0, pitch: 0, zoom: 0.5 });
  });
});

describe('zoom', () => {
  test('applies a zoom delta additively', () => {
    expect(applyZoomDelta(DEFAULT_CAMERA_STATE, 0.1).zoom).toBeCloseTo(0.6);
  });

  test('clamps to ZOOM_MIN', () => {
    expect(applyZoomDelta(DEFAULT_CAMERA_STATE, -10).zoom).toBe(ZOOM_MIN);
  });

  test('clamps to ZOOM_MAX', () => {
    expect(applyZoomDelta(DEFAULT_CAMERA_STATE, 10).zoom).toBe(ZOOM_MAX);
  });
});

describe('reset', () => {
  test('resetCamera returns the exact default camera state', () => {
    expect(resetCamera()).toEqual(DEFAULT_CAMERA_STATE);
  });

  test('resetSelection returns the exact empty selection', () => {
    expect(resetSelection()).toEqual(EMPTY_SELECTION);
  });

  test('defaultInteractionState combines both', () => {
    expect(defaultInteractionState()).toEqual({
      camera: DEFAULT_CAMERA_STATE,
      selection: EMPTY_SELECTION,
    });
  });
});

describe('cameraStateToFraming (the exact-equality parity guarantee)', () => {
  test('zoom 0 maps to the minimum distance', () => {
    expect(cameraStateToFraming({ yaw: 0, pitch: 0, zoom: 0 }).distance).toBe(CAMERA_MIN_DISTANCE);
  });

  test('zoom 1 maps to the maximum distance', () => {
    expect(cameraStateToFraming({ yaw: 0, pitch: 0, zoom: 1 }).distance).toBe(CAMERA_MAX_DISTANCE);
  });

  test('yaw 0.25 (a quarter turn) maps to pi/2 radians', () => {
    expect(cameraStateToFraming({ yaw: 0.25, pitch: 0, zoom: 0.5 }).azimuthRadians).toBeCloseTo(
      Math.PI / 2,
    );
  });

  test('is a pure function: identical input always produces identical output', () => {
    const state = { yaw: 0.37, pitch: -0.12, zoom: 0.73 };
    expect(cameraStateToFraming(state)).toEqual(cameraStateToFraming({ ...state }));
  });
});

describe('regionIdFromMeshName (hit mesh -> region)', () => {
  const regionIds = ['chest', 'biceps', 'lower_back'];

  test('resolves a region mesh name to its region id', () => {
    expect(regionIdFromMeshName('region-chest', regionIds)).toBe('chest');
    expect(regionIdFromMeshName('region-lower_back', regionIds)).toBe('lower_back');
  });

  test('returns null for meshes that are not regions (context muscle, bone)', () => {
    expect(regionIdFromMeshName('muscle-context', regionIds)).toBeNull();
    expect(regionIdFromMeshName('bone', regionIds)).toBeNull();
  });

  test('returns null for a region mesh whose id is not a known region', () => {
    expect(regionIdFromMeshName('region-tail', regionIds)).toBeNull();
    expect(regionIdFromMeshName('region-', regionIds)).toBeNull();
  });

  test('empty region list always resolves to null', () => {
    expect(regionIdFromMeshName('region-chest', [])).toBeNull();
  });
});

describe('interactionReducer (the single entry point both renderers must use)', () => {
  const regions = ['chest'];

  test('rotate action updates only camera', () => {
    const state = defaultInteractionState();
    const next = interactionReducer(state, { type: 'rotate', deltaYawTurns: 0.1, deltaPitchTurns: 0 }, regions, 1000);
    expect(next.camera.yaw).toBeCloseTo(0.1);
    expect(next.selection).toEqual(state.selection);
  });

  test('zoom action updates only camera', () => {
    const state = defaultInteractionState();
    const next = interactionReducer(state, { type: 'zoom', deltaZoom: 0.1 }, regions, 1000);
    expect(next.camera.zoom).toBeCloseTo(0.6);
  });

  test('select action sets regionId and timestamp for a known region', () => {
    const state = defaultInteractionState();
    const next = interactionReducer(state, { type: 'select', regionId: 'chest' }, regions, 12345);
    expect(next.selection).toEqual({ regionId: 'chest', timestamp: 12345 });
  });

  test('select action leaves state unchanged when the tap hit no region', () => {
    const state = defaultInteractionState();
    expect(interactionReducer(state, { type: 'select', regionId: null }, regions, 12345)).toEqual(state);
  });

  test('select action leaves state unchanged for an unknown region id', () => {
    const state = defaultInteractionState();
    expect(interactionReducer(state, { type: 'select', regionId: 'tail' }, regions, 12345)).toEqual(state);
  });

  test('face action turns to look straight at the front or back, keeping zoom and selection', () => {
    let state = defaultInteractionState();
    state = interactionReducer(state, { type: 'rotate', deltaYawTurns: 0.3, deltaPitchTurns: 0.2 }, regions, 1);
    state = interactionReducer(state, { type: 'zoom', deltaZoom: -0.2 }, regions, 2);
    state = interactionReducer(state, { type: 'select', regionId: 'chest' }, regions, 3);

    const back = interactionReducer(state, { type: 'face', side: 'back' }, regions, 4);
    expect(back.camera).toEqual({ yaw: 0.5, pitch: 0, zoom: state.camera.zoom });
    expect(back.selection).toEqual(state.selection);

    const front = interactionReducer(back, { type: 'face', side: 'front' }, regions, 5);
    expect(front.camera).toEqual({ yaw: 0, pitch: 0, zoom: state.camera.zoom });
    expect(faceCamera(DEFAULT_CAMERA_STATE, 'front')).toEqual(DEFAULT_CAMERA_STATE);
  });

  test('reset action returns to defaults regardless of prior state', () => {
    let state = defaultInteractionState();
    state = interactionReducer(state, { type: 'rotate', deltaYawTurns: 0.3, deltaPitchTurns: 0.2 }, regions, 1);
    state = interactionReducer(state, { type: 'select', regionId: 'chest' }, regions, 2);
    const afterReset = interactionReducer(state, { type: 'reset' }, regions, 3);
    expect(afterReset).toEqual(defaultInteractionState());
  });

  test('an identical action sequence always produces an identical final state (determinism)', () => {
    const actions: Parameters<typeof interactionReducer>[1][] = [
      { type: 'rotate', deltaYawTurns: 0.2, deltaPitchTurns: 0.1 },
      { type: 'zoom', deltaZoom: -0.1 },
      { type: 'select', regionId: 'chest' },
      { type: 'rotate', deltaYawTurns: -0.05, deltaPitchTurns: 0 },
    ];
    function run() {
      let state = defaultInteractionState();
      for (const action of actions) {
        state = interactionReducer(state, action, regions, 42);
      }
      return state;
    }
    expect(run()).toEqual(run());
  });
});
