// Phase 4: the fixed list of selectable muscle regions, aligned with Phase
// 3's muscle taxonomy (spec.md A-4/OQ-2 — see
// /data/exercises/mapping/muscleTaxonomy.json, the source of truth this
// list is cross-checked against in __tests__/muscleRegions.test.ts).
//
// Each region is one mesh of the vendored anatomical body
// (docs/licensing/anatomical-mesh-license.md), named
// `region-<id>` (REGION_MESH_PREFIX) and built from the Z-Anatomy muscles
// listed for it in ../scripts/buildAnatomyMesh.py — so a region's boundary
// is the real muscles' outline, not a calibrated volume.
// ../scripts/checkRegionCoverage.ts verifies the vendored mesh has exactly
// one mesh per id below.

import type { RegionId } from './interactionContract';

export const MUSCLE_REGION_IDS: readonly RegionId[] = [
  'neck',
  'traps',
  'shoulders',
  'chest',
  'middle_back',
  'lats',
  'biceps',
  'triceps',
  'forearms',
  'abdominals',
  'lower_back',
  'glutes',
  'abductors',
  'adductors',
  'quadriceps',
  'hamstrings',
  'calves',
];
