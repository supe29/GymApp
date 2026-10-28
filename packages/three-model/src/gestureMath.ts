// Phase 4: pure conversion of raw, platform-specific input deltas (mouse
// drag pixels, wheel scroll units, pinch-distance-in-pixels) into the
// normalized units interactionContract.ts's actions expect. Kept separate
// from and shared by both adapters so that "a given physical drag distance
// produces the same rotation on both platforms" (plan.md Phase 4) is true
// by construction, not by two independently-tuned implementations — web's
// mouse-drag rotation and native's touch-drag rotation both call
// `dragDeltaToRotation`; only *which raw event supplied the pixel delta*
// differs per platform.

import { ROTATE_PIXELS_PER_TURN, ZOOM_UNITS_PER_FULL_RANGE } from './interactionContract';

export interface RotationDelta {
  deltaYawTurns: number;
  deltaPitchTurns: number;
}

/**
 * A drag of `dx` pixels right / `dy` pixels down maps to a negative yaw
 * (rotating the model to follow the drag direction, matching the common
 * "grab and spin" convention) and a negative pitch (dragging down tilts
 * the view down).
 */
export function dragDeltaToRotation(dx: number, dy: number): RotationDelta {
  return {
    deltaYawTurns: -dx / ROTATE_PIXELS_PER_TURN,
    deltaPitchTurns: -dy / ROTATE_PIXELS_PER_TURN,
  };
}

/** Web: mouse wheel/trackpad scroll. Positive deltaY (scroll down/away) zooms out. */
export function wheelDeltaToZoom(deltaY: number): number {
  return deltaY / ZOOM_UNITS_PER_FULL_RANGE;
}

/**
 * Native: two-finger pinch. `distanceDeltaPixels` is
 * (currentFingerDistance - previousFingerDistance); fingers moving apart
 * (positive delta) zooms in, so the sign is inverted relative to wheel.
 */
export function pinchDeltaToZoom(distanceDeltaPixels: number): number {
  return -distanceDeltaPixels / ZOOM_UNITS_PER_FULL_RANGE;
}
