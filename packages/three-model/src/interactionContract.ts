// Phase 4: the renderer-independent 3D interaction contract (plan.md
// Phase 4, ADR-3). Every rotate/zoom/select/reset action a user performs
// on the 3D muscle model — on either platform — must be funneled through
// `interactionReducer` below. Neither `BodyModel.web.tsx` nor
// `BodyModel.native.tsx` is permitted to compute camera or selection state
// any other way; each renderer's only jobs are (a) capturing raw input
// (drag deltas, pinch/scroll deltas, raycast hit points) and converting it
// to the normalized units this file defines, and (b) applying the
// resulting `InteractionState` to its own Three.js camera/scene.
//
// This is what makes FR-4.4/NFR-1 cross-platform parity a structural
// guarantee rather than a "we tested it and it seemed to match" claim: for
// an identical sequence of actions, both renderers produce bit-for-bit
// identical `InteractionState` and `CameraFraming` values, because they
// both call this exact same code, not two independent reimplementations.

/** A muscle-group region id — must exactly match muscle_groups.key (see muscleRegions.ts and spec.md A-4/OQ-2). */
export type RegionId = string;

// ---------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------

export interface CameraState {
  /** Horizontal orbit angle, normalized turns. 0 = front-facing. Wraps at 1 (i.e. 0 and 1 are the same orientation). */
  yaw: number;
  /** Vertical orbit angle, normalized -1..1. 0 = eye-level. Clamped to PITCH_MIN/PITCH_MAX to prevent flipping over the top or bottom of the model. */
  pitch: number;
  /** Normalized zoom/distance, 0 (closest allowed) .. 1 (farthest allowed). */
  zoom: number;
}

export const PITCH_MIN = -0.4;
export const PITCH_MAX = 0.4;
export const ZOOM_MIN = 0;
export const ZOOM_MAX = 1;

export const DEFAULT_CAMERA_STATE: Readonly<CameraState> = Object.freeze({
  yaw: 0,
  pitch: 0,
  zoom: 0.5,
});

/**
 * Pixels (or pixel-equivalent input units) per full 360° yaw turn, and per
 * full pitch range, used by each renderer to convert a raw drag gesture
 * into normalized turns before calling `applyRotationDelta`. Defined once,
 * here, so a given physical drag distance produces the same rotation on
 * both platforms — this is part of the contract, not a per-renderer
 * tuning knob.
 */
export const ROTATE_PIXELS_PER_TURN = 600;

/** Pinch-distance or scroll-wheel units per full 0..1 zoom range, same rationale as ROTATE_PIXELS_PER_TURN. */
export const ZOOM_UNITS_PER_FULL_RANGE = 400;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function wrapUnitInterval(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/** Applies a rotation gesture, already converted to normalized turns, to camera state. */
export function applyRotationDelta(
  camera: CameraState,
  deltaYawTurns: number,
  deltaPitchTurns: number,
): CameraState {
  return {
    ...camera,
    yaw: wrapUnitInterval(camera.yaw + deltaYawTurns),
    pitch: clamp(camera.pitch + deltaPitchTurns, PITCH_MIN, PITCH_MAX),
  };
}

/** Applies a zoom gesture, already converted to normalized units, to camera state. */
export function applyZoomDelta(camera: CameraState, deltaZoom: number): CameraState {
  return { ...camera, zoom: clamp(camera.zoom + deltaZoom, ZOOM_MIN, ZOOM_MAX) };
}

export function resetCamera(): CameraState {
  return { ...DEFAULT_CAMERA_STATE };
}

/** World-space distance bounds the normalized zoom range maps to. Model-space units (see muscleRegions.ts for the coordinate system). */
export const CAMERA_MIN_DISTANCE = 1.5;
export const CAMERA_MAX_DISTANCE = 4.5;

export interface CameraFraming {
  /** Distance from the model's focal point, in model-space units. */
  distance: number;
  /** Horizontal orbit angle in radians. */
  azimuthRadians: number;
  /** Vertical orbit angle in radians, measured from the pole (matches three.js spherical coordinate convention). */
  polarRadians: number;
}

/**
 * The single function both renderers call to turn normalized camera state
 * into the actual numbers they hand to their Three.js camera (via
 * spherical-to-Cartesian conversion, done identically by `three`'s own
 * `Spherical`/`Vector3` on both platforms since both renderers depend on
 * the same `three` package). Because this function is shared, not
 * reimplemented, camera framing is exactly equal given equal state —
 * there is no numeric tolerance to define (resolves OQ-10: the tolerance
 * is zero at the state layer; only GPU/anti-aliasing pixel differences,
 * which this contract does not attempt to measure, remain).
 */
export function cameraStateToFraming(camera: CameraState): CameraFraming {
  return {
    distance: CAMERA_MIN_DISTANCE + camera.zoom * (CAMERA_MAX_DISTANCE - CAMERA_MIN_DISTANCE),
    azimuthRadians: camera.yaw * Math.PI * 2,
    polarRadians: Math.PI / 2 - camera.pitch * Math.PI,
  };
}

// ---------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------

export interface SelectionState {
  regionId: RegionId | null;
  /** Epoch ms the selection was made; 0 when there is no selection (post-reset). */
  timestamp: number;
}

export const EMPTY_SELECTION: Readonly<SelectionState> = Object.freeze({
  regionId: null,
  timestamp: 0,
});

export function resetSelection(): SelectionState {
  return { ...EMPTY_SELECTION };
}

/** An axis-aligned bounding box in model-local space defining one selectable muscle region. See muscleRegions.ts. */
export interface RegionVolume {
  id: RegionId;
  center: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
}

function isInsideBox(point: readonly [number, number, number], volume: RegionVolume): boolean {
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(point[axis] - volume.center[axis]) > volume.halfExtents[axis]) {
      return false;
    }
  }
  return true;
}

function distanceSquared(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Resolves which region (if any) a raycast hit point belongs to.
 * Renderer-independent: both renderers perform their own platform-specific
 * raycast against their own scene graph to get a `point` in model-local
 * space, then call this shared function — the only part of hit-testing
 * that is genuinely renderer-specific is producing that point.
 *
 * Selection precision / tie-break rule: if a point falls inside more than
 * one region's volume (overlapping regions), the region whose *center* is
 * closest to the point wins. This is deterministic and independent of
 * iteration order or which renderer produced the point.
 */
export function resolveRegionAtPoint(
  point: readonly [number, number, number],
  regions: readonly RegionVolume[],
): RegionId | null {
  let best: RegionVolume | null = null;
  let bestDistanceSquared = Infinity;

  for (const region of regions) {
    if (!isInsideBox(point, region)) continue;
    const d = distanceSquared(point, region.center);
    if (d < bestDistanceSquared) {
      best = region;
      bestDistanceSquared = d;
    }
  }

  return best ? best.id : null;
}

// ---------------------------------------------------------------------
// Combined state + reducer
// ---------------------------------------------------------------------

export interface InteractionState {
  camera: CameraState;
  selection: SelectionState;
}

export function defaultInteractionState(): InteractionState {
  return { camera: resetCamera(), selection: resetSelection() };
}

export type InteractionAction =
  | { type: 'rotate'; deltaYawTurns: number; deltaPitchTurns: number }
  | { type: 'zoom'; deltaZoom: number }
  | { type: 'select'; point: readonly [number, number, number] }
  | { type: 'reset' };

/**
 * The single state-transition function both `BodyModel.web.tsx` and
 * `BodyModel.native.tsx` must call for every user input. `now` is injected
 * (rather than read via `Date.now()` internally) so this function stays
 * pure and trivially testable.
 */
export function interactionReducer(
  state: InteractionState,
  action: InteractionAction,
  regions: readonly RegionVolume[],
  now: number,
): InteractionState {
  switch (action.type) {
    case 'rotate':
      return {
        ...state,
        camera: applyRotationDelta(state.camera, action.deltaYawTurns, action.deltaPitchTurns),
      };
    case 'zoom':
      return { ...state, camera: applyZoomDelta(state.camera, action.deltaZoom) };
    case 'select': {
      const regionId = resolveRegionAtPoint(action.point, regions);
      if (regionId === null) {
        return state;
      }
      return { ...state, selection: { regionId, timestamp: now } };
    }
    case 'reset':
      return defaultInteractionState();
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
