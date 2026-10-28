import { dragDeltaToRotation, pinchDeltaToZoom, wheelDeltaToZoom } from '../gestureMath';
import { ROTATE_PIXELS_PER_TURN, ZOOM_UNITS_PER_FULL_RANGE } from '../interactionContract';

describe('dragDeltaToRotation (shared by web mouse-drag and native touch-drag)', () => {
  test('a full ROTATE_PIXELS_PER_TURN rightward drag yields exactly -1 full yaw turn', () => {
    expect(dragDeltaToRotation(ROTATE_PIXELS_PER_TURN, 0).deltaYawTurns).toBe(-1);
  });

  test('a leftward drag yields a positive yaw delta', () => {
    expect(dragDeltaToRotation(-100, 0).deltaYawTurns).toBeGreaterThan(0);
  });

  test('a downward drag yields a negative pitch delta', () => {
    expect(dragDeltaToRotation(0, 100).deltaPitchTurns).toBeLessThan(0);
  });

  test('zero movement yields zero rotation', () => {
    expect(dragDeltaToRotation(0, 0)).toEqual({ deltaYawTurns: -0, deltaPitchTurns: -0 });
  });
});

describe('wheelDeltaToZoom (web)', () => {
  test('a full ZOOM_UNITS_PER_FULL_RANGE scroll yields exactly 1.0 zoom delta', () => {
    expect(wheelDeltaToZoom(ZOOM_UNITS_PER_FULL_RANGE)).toBe(1);
  });

  test('scrolling up (negative deltaY) zooms in (negative delta)', () => {
    expect(wheelDeltaToZoom(-100)).toBeLessThan(0);
  });
});

describe('pinchDeltaToZoom (native)', () => {
  test('fingers moving apart by a full ZOOM_UNITS_PER_FULL_RANGE zooms in by exactly 1.0', () => {
    expect(pinchDeltaToZoom(ZOOM_UNITS_PER_FULL_RANGE)).toBe(-1);
  });

  test('fingers moving together zooms out (positive delta)', () => {
    expect(pinchDeltaToZoom(-100)).toBeGreaterThan(0);
  });

  test('pinch-out (spread) and wheel-scroll-up both zoom in, in opposite raw-sign convention', () => {
    // A "zoom in" gesture on each platform should always produce a
    // negative zoom delta from this layer, regardless of the platform's
    // own raw-input sign convention (wheel: negative deltaY; pinch:
    // positive distance delta).
    expect(wheelDeltaToZoom(-50)).toBeLessThan(0);
    expect(pinchDeltaToZoom(50)).toBeLessThan(0);
  });
});
