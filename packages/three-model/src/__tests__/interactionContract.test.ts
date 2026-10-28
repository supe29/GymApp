import {
  applyRotationDelta,
  applyZoomDelta,
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
  cameraStateToFraming,
  DEFAULT_CAMERA_STATE,
  defaultInteractionState,
  EMPTY_SELECTION,
  interactionReducer,
  PITCH_MAX,
  PITCH_MIN,
  resetCamera,
  resetSelection,
  resolveRegionAtPoint,
  type RegionVolume,
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

describe('resolveRegionAtPoint (selection precision / tie-break)', () => {
  const chest: RegionVolume = { id: 'chest', center: [0, 1, 0], halfExtents: [0.2, 0.2, 0.2] };
  const abs: RegionVolume = { id: 'abdominals', center: [0, 0.6, 0], halfExtents: [0.2, 0.2, 0.2] };
  const regions = [chest, abs];

  test('returns the region whose box contains the point', () => {
    expect(resolveRegionAtPoint([0, 1, 0], regions)).toBe('chest');
  });

  test('returns null when the point is outside every region', () => {
    expect(resolveRegionAtPoint([10, 10, 10], regions)).toBeNull();
  });

  test('tie-break: when two boxes overlap, the region whose center is nearer wins', () => {
    const overlapping: RegionVolume[] = [
      { id: 'a', center: [0, 0, 0], halfExtents: [1, 1, 1] },
      { id: 'b', center: [0, 0.5, 0], halfExtents: [1, 1, 1] },
    ];
    // Point closer to b's center (0.5) than a's center (0):
    expect(resolveRegionAtPoint([0, 0.6, 0], overlapping)).toBe('b');
    // Point closer to a's center:
    expect(resolveRegionAtPoint([0, 0.1, 0], overlapping)).toBe('a');
  });

  test('tie-break result does not depend on array order', () => {
    const overlapping: RegionVolume[] = [
      { id: 'a', center: [0, 0, 0], halfExtents: [1, 1, 1] },
      { id: 'b', center: [0, 0.5, 0], halfExtents: [1, 1, 1] },
    ];
    const reversed = [...overlapping].reverse();
    expect(resolveRegionAtPoint([0, 0.6, 0], overlapping)).toBe(
      resolveRegionAtPoint([0, 0.6, 0], reversed),
    );
  });

  test('empty region list always resolves to null', () => {
    expect(resolveRegionAtPoint([0, 0, 0], [])).toBeNull();
  });
});

describe('interactionReducer (the single entry point both renderers must use)', () => {
  const regions: RegionVolume[] = [
    { id: 'chest', center: [0, 1, 0], halfExtents: [0.2, 0.2, 0.2] },
  ];

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

  test('select action sets regionId and timestamp when the point hits a region', () => {
    const state = defaultInteractionState();
    const next = interactionReducer(state, { type: 'select', point: [0, 1, 0] }, regions, 12345);
    expect(next.selection).toEqual({ regionId: 'chest', timestamp: 12345 });
  });

  test('select action leaves state unchanged when the point hits no region', () => {
    const state = defaultInteractionState();
    const next = interactionReducer(state, { type: 'select', point: [99, 99, 99] }, regions, 12345);
    expect(next).toEqual(state);
  });

  test('reset action returns to defaults regardless of prior state', () => {
    let state = defaultInteractionState();
    state = interactionReducer(state, { type: 'rotate', deltaYawTurns: 0.3, deltaPitchTurns: 0.2 }, regions, 1);
    state = interactionReducer(state, { type: 'select', point: [0, 1, 0] }, regions, 2);
    const afterReset = interactionReducer(state, { type: 'reset' }, regions, 3);
    expect(afterReset).toEqual(defaultInteractionState());
  });

  test('an identical action sequence always produces an identical final state (determinism)', () => {
    const actions: Parameters<typeof interactionReducer>[1][] = [
      { type: 'rotate', deltaYawTurns: 0.2, deltaPitchTurns: 0.1 },
      { type: 'zoom', deltaZoom: -0.1 },
      { type: 'select', point: [0, 1, 0] },
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
