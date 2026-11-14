// FR-8.5: the Body progress heatmap's per-region tint. It is a steady
// (non-pulsing) tint driven by caller state (BodyModelProps.regionIntensity),
// like the exercise pulse in pulseAnimation.ts. Pure, so both renderer
// adapters get identical values from shared/BodyModelScene.tsx by
// construction (asserted in the cross-renderer parity suite).

/** Tint of a region that was barely worked, so any work done stays visible on the model. */
export const HEATMAP_MIN_TINT = 0.2;
/** Tint of a region whose planned work is fully done. */
export const HEATMAP_MAX_TINT = 1;

/**
 * Tint strength (0 = base color, up to HEATMAP_MAX_TINT) for one region,
 * from its 0–1 intensity. Missing, non-finite or non-positive intensities
 * give 0; values above 1 are clamped.
 */
export function regionHeatmapTint(
  regionId: string,
  regionIntensity: Readonly<Record<string, number>> | null | undefined,
): number {
  const raw = regionIntensity?.[regionId];
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return 0;
  const intensity = Math.min(1, raw);
  return HEATMAP_MIN_TINT + (HEATMAP_MAX_TINT - HEATMAP_MIN_TINT) * intensity;
}
