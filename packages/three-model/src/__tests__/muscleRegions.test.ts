import { readFileSync } from 'node:fs';
import path from 'node:path';

import { findRegionVolume, MUSCLE_REGION_IDS, MUSCLE_REGIONS } from '../muscleRegions';

describe('MUSCLE_REGIONS', () => {
  test('has no duplicate region ids', () => {
    expect(new Set(MUSCLE_REGION_IDS).size).toBe(MUSCLE_REGION_IDS.length);
  });

  test('every region has strictly positive half-extents (a real, non-degenerate volume)', () => {
    for (const region of MUSCLE_REGIONS) {
      for (const extent of region.halfExtents) {
        expect(extent).toBeGreaterThan(0);
      }
    }
  });

  test('findRegionVolume finds an existing region and returns undefined for an unknown one', () => {
    expect(findRegionVolume('chest')?.id).toBe('chest');
    expect(findRegionVolume('nonexistent_region')).toBeUndefined();
  });

  // spec.md A-4/OQ-2: the app's muscle-group taxonomy is fixed and defined
  // once. This cross-checks that Phase 4's region ids are exactly the set
  // Phase 3 already established (data/exercises/mapping/muscleTaxonomy.json),
  // not a second, silently-drifting copy of the same list.
  test('region ids exactly match Phase 3\'s muscle taxonomy keys', () => {
    const taxonomyPath = path.resolve(
      __dirname,
      '../../../../data/exercises/mapping/muscleTaxonomy.json',
    );
    const taxonomy = JSON.parse(readFileSync(taxonomyPath, 'utf8')) as {
      groups: { key: string }[];
    };
    const taxonomyKeys = taxonomy.groups.map((g) => g.key).sort();
    expect([...MUSCLE_REGION_IDS].sort()).toEqual(taxonomyKeys);
  });
});
