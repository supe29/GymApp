import { HEATMAP_MAX_TINT, HEATMAP_MIN_TINT, regionHeatmapTint } from '../heatmap';

describe('regionHeatmapTint (FR-8.5, shared by web and native)', () => {
  test('is 0 for regions with no intensity, no map, or non-positive values', () => {
    expect(regionHeatmapTint('chest', null)).toBe(0);
    expect(regionHeatmapTint('chest', {})).toBe(0);
    expect(regionHeatmapTint('chest', { chest: 0 })).toBe(0);
    expect(regionHeatmapTint('chest', { chest: -1 })).toBe(0);
    expect(regionHeatmapTint('chest', { chest: Number.NaN })).toBe(0);
  });

  test('maps 0–1 onto the min–max tint, so light work still shows', () => {
    expect(regionHeatmapTint('chest', { chest: 0.0001 })).toBeCloseTo(HEATMAP_MIN_TINT, 3);
    expect(regionHeatmapTint('chest', { chest: 0.5 })).toBeCloseTo((HEATMAP_MIN_TINT + HEATMAP_MAX_TINT) / 2);
    expect(regionHeatmapTint('chest', { chest: 1 })).toBe(HEATMAP_MAX_TINT);
  });

  test('clamps values above 1', () => {
    expect(regionHeatmapTint('chest', { chest: 3 })).toBe(HEATMAP_MAX_TINT);
  });
});
