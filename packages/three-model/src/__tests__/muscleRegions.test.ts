import { readFileSync } from 'node:fs';
import path from 'node:path';

import { MUSCLE_REGION_IDS } from '../muscleRegions';

describe('MUSCLE_REGION_IDS', () => {
  test('has no duplicate region ids', () => {
    expect(new Set(MUSCLE_REGION_IDS).size).toBe(MUSCLE_REGION_IDS.length);
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
