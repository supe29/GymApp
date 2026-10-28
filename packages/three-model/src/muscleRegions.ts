// Phase 4: the fixed list of selectable muscle regions, aligned with Phase
// 3's muscle taxonomy (spec.md A-4/OQ-2 — see
// /data/exercises/mapping/muscleTaxonomy.json, the source of truth this
// file's `key`s are cross-checked against in
// __tests__/muscleRegions.test.ts).
//
// Coordinate system (model-local space, placeholder pending the real mesh —
// see docs/licensing/3d-mesh-license.md): a standing human figure, feet at
// y=0, head at y≈1.9, facing +z, centered on x=0. Units are arbitrary
// "model units" consistent with CAMERA_MIN_DISTANCE/CAMERA_MAX_DISTANCE in
// interactionContract.ts. These bounding boxes are deliberately
// approximate placeholders standing in for the licensed Mixamo mesh (not
// yet vendored — see docs/deferred-production-checks.md); they exist to
// make hit-testing and the parity suite fully real and testable now, and
// will need recalibrating to the final mesh's actual proportions once it
// is vendored, without changing the interaction contract itself.

import type { RegionVolume } from './interactionContract';

export const MUSCLE_REGIONS: readonly RegionVolume[] = [
  { id: 'neck', center: [0, 1.78, 0], halfExtents: [0.09, 0.08, 0.09] },
  { id: 'traps', center: [0, 1.62, -0.05], halfExtents: [0.22, 0.08, 0.12] },
  { id: 'shoulders', center: [0, 1.55, 0], halfExtents: [0.42, 0.1, 0.14] },
  { id: 'chest', center: [0, 1.42, 0.1], halfExtents: [0.24, 0.12, 0.12] },
  { id: 'middle_back', center: [0, 1.4, -0.12], halfExtents: [0.2, 0.14, 0.1] },
  { id: 'biceps', center: [0.5, 1.3, 0.08], halfExtents: [0.08, 0.14, 0.08] },
  { id: 'triceps', center: [0.5, 1.3, -0.08], halfExtents: [0.08, 0.14, 0.08] },
  { id: 'abdominals', center: [0, 1.15, 0.11], halfExtents: [0.16, 0.16, 0.1] },
  { id: 'lower_back', center: [0, 1.05, -0.11], halfExtents: [0.18, 0.12, 0.09] },
  { id: 'lats', center: [0.24, 1.28, -0.1], halfExtents: [0.1, 0.16, 0.1] },
  { id: 'forearms', center: [0.5, 1.02, 0], halfExtents: [0.07, 0.16, 0.07] },
  { id: 'glutes', center: [0, 0.92, -0.1], halfExtents: [0.18, 0.1, 0.1] },
  { id: 'abductors', center: [0.2, 0.85, -0.02], halfExtents: [0.08, 0.14, 0.09] },
  { id: 'adductors', center: [0.1, 0.8, 0.05], halfExtents: [0.07, 0.14, 0.08] },
  { id: 'quadriceps', center: [0.15, 0.68, 0.1], halfExtents: [0.11, 0.22, 0.09] },
  { id: 'hamstrings', center: [0.15, 0.68, -0.1], halfExtents: [0.11, 0.22, 0.09] },
  { id: 'calves', center: [0.15, 0.28, -0.08], halfExtents: [0.09, 0.18, 0.08] },
];

export const MUSCLE_REGION_IDS: readonly string[] = MUSCLE_REGIONS.map((r) => r.id);

export function findRegionVolume(regionId: string): RegionVolume | undefined {
  return MUSCLE_REGIONS.find((r) => r.id === regionId);
}
