// Pure, renderer-independent oscillation math for the per-exercise muscle-
// region pulse (apps/app/features/muscle-explorer/MuscleExplorerScreen.tsx:
// tapping an exercise in the filtered list pulses its primary/secondary
// regions on the model). Deliberately not part of interactionContract.ts's
// interactionReducer — unlike camera/selection, this isn't a user gesture
// on the 3D view itself, it's driven by state outside the component
// (which exercise is active), so it's a separate additive prop
// (BodyModelProps.activeExerciseMuscles) rather than a reducer action.
// Kept pure and shared (not computed inline in shared/BodyModelScene.tsx's
// useFrame loop) so both adapters produce identical values by construction,
// the same reasoning as gestureMath.ts.

/** One full pulse cycle per this many seconds. */
export const PULSE_PERIOD_SECONDS = 1.6;
const PULSE_FREQUENCY = (2 * Math.PI) / PULSE_PERIOD_SECONDS;

/** Primary-muscle regions pulse brighter than the static 0.35 selection highlight. */
export const PRIMARY_PEAK_OPACITY = 0.45;
/** Secondary-muscle regions pulse dimmer, clearly subordinate to primary. */
export const SECONDARY_PEAK_OPACITY = 0.25;

/**
 * Oscillates between 0 and `peakOpacity` as a function of elapsed time.
 * Pure and deterministic: the same `elapsedSeconds`/`peakOpacity` always
 * produce the same output, regardless of which renderer (web/native) calls
 * it — that's what makes cross-renderer parity hold by construction here.
 */
export function pulseOpacity(elapsedSeconds: number, peakOpacity: number): number {
  return ((Math.sin(elapsedSeconds * PULSE_FREQUENCY) + 1) / 2) * peakOpacity;
}

/**
 * The pulse ceiling for a given region: PRIMARY_PEAK_OPACITY if it's one of
 * the active exercise's primary muscles, SECONDARY_PEAK_OPACITY if
 * secondary, 0 if untargeted or no exercise is active. Pure, so both
 * renderers (which share shared/BodyModelScene.tsx, but this keeps the
 * mapping itself independently testable/parity-assertable) resolve the
 * same region to the same ceiling.
 */
export function regionPulsePeakOpacity(
  regionId: string,
  activeExerciseMuscles: { primary: readonly string[]; secondary: readonly string[] } | null | undefined,
): number {
  if (!activeExerciseMuscles) return 0;
  if (activeExerciseMuscles.primary.includes(regionId)) return PRIMARY_PEAK_OPACITY;
  if (activeExerciseMuscles.secondary.includes(regionId)) return SECONDARY_PEAK_OPACITY;
  return 0;
}
