// Phase 4: the renderer-independent 3D interaction contract (plan.md
// Phase 4, ADR-3). Every rotate/zoom/select/reset action a user performs
// on the 3D muscle model — on either platform — must be funneled through
// `interactionReducer` below. Neither `BodyModel.web.tsx` nor
// `BodyModel.native.tsx` is permitted to compute camera or selection state
// any other way; each renderer's only jobs are (a) capturing raw input
// (drag deltas, pinch/scroll deltas, raycast hits) and converting it
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

export type ModelSide = 'front' | 'back';

/** Turns the camera to look straight at the model's front or back, keeping the current zoom. */
export function faceCamera(camera: CameraState, side: ModelSide): CameraState {
  return { ...DEFAULT_CAMERA_STATE, zoom: camera.zoom, yaw: side === 'back' ? 0.5 : 0 };
}

/** World-space distance bounds the normalized zoom range maps to. Model-space units (see shared/meshNormalization.ts for the coordinate system). */
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

/**
 * Body meshes that belong to a selectable region are named
 * `region-<RegionId>` (see muscleRegions.ts and
 * scripts/buildAnatomyMesh.py); every other mesh (context muscles, bone) is
 * not selectable.
 */
export const REGION_MESH_PREFIX = 'region-';

/**
 * Resolves which region (if any) a raycast hit belongs to, from the name
 * of the mesh it hit. Renderer-independent: both renderers perform their
 * own platform-specific raycast against their own scene graph, then call
 * this shared function with the hit mesh's name — the only part of
 * hit-testing that is genuinely renderer-specific is producing that hit.
 *
 * Selection precision: every triangle of the body belongs to exactly one
 * mesh, so a hit resolves to at most one region — there is no overlap and
 * no tie-break to define. Both sides of the body share one mesh per
 * region, so either arm or leg selects the same region.
 */
export function regionIdFromMeshName(meshName: string, regionIds: readonly RegionId[]): RegionId | null {
  if (!meshName.startsWith(REGION_MESH_PREFIX)) return null;
  const regionId = meshName.slice(REGION_MESH_PREFIX.length);
  return regionIds.includes(regionId) ? regionId : null;
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
  /** A tap on the body: the region regionIdFromMeshName resolved for the hit mesh, or null when it hit no region. */
  | { type: 'select'; regionId: RegionId | null }
  | { type: 'face'; side: ModelSide }
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
  regionIds: readonly RegionId[],
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
      const { regionId } = action;
      if (regionId === null || !regionIds.includes(regionId)) {
        return state;
      }
      return { ...state, selection: { regionId, timestamp: now } };
    }
    case 'face':
      return { ...state, camera: faceCamera(state.camera, action.side) };
    case 'reset':
      return defaultInteractionState();
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
