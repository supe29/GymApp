import { buildDayMuscleCoverage, weightedSetsByMuscle } from './muscleCoverage';

const names = { chest: 'Chest', triceps: 'Triceps', shoulders: 'Shoulders', biceps: 'Biceps', lats: 'Lats' };
const bench = { primaryMuscleKeys: ['chest'], secondaryMuscleKeys: ['triceps', 'shoulders'] };
const pushdown = { primaryMuscleKeys: ['triceps'], secondaryMuscleKeys: [] };
const curl = { primaryMuscleKeys: ['biceps'], secondaryMuscleKeys: [] };

describe('weightedSetsByMuscle', () => {
  it('counts primary sets as 1 and secondary sets as 0.5', () => {
    const weighted = weightedSetsByMuscle([{ sets: 4, ...bench }, { sets: 3, ...pushdown }]);
    expect(Object.fromEntries(weighted)).toEqual({ chest: 4, triceps: 5, shoulders: 2 });
  });

  it('ignores exercises with no sets', () => {
    expect(weightedSetsByMuscle([{ sets: 0, ...bench }]).size).toBe(0);
  });
});

describe('FR-8.5: buildDayMuscleCoverage', () => {
  it('reports done, planned, remaining and percent per muscle and overall', () => {
    const coverage = buildDayMuscleCoverage({
      planned: [{ sets: 4, ...bench }, { sets: 3, ...pushdown }],
      done: [{ sets: 2, ...bench }],
      muscleNames: names,
    });
    const chest = coverage.muscles.find((m) => m.key === 'chest');
    expect(chest).toEqual({
      key: 'chest',
      name: 'Chest',
      plannedSets: 4,
      doneSets: 2,
      remainingSets: 2,
      percent: 50,
      extra: false,
    });
    const triceps = coverage.muscles.find((m) => m.key === 'triceps');
    expect(triceps).toMatchObject({ plannedSets: 5, doneSets: 1, remainingSets: 4, percent: 20 });
    // planned 4 + 5 + 2 = 11; done toward plan 2 + 1 + 1 = 4
    expect(coverage.plannedTotal).toBe(11);
    expect(coverage.doneTowardPlan).toBe(4);
    expect(coverage.overallPercent).toBe(36);
    expect(coverage.regionIntensity.chest).toBeCloseTo(0.5);
  });

  it('caps percent at 100 and does not let extra work raise the overall percent', () => {
    const coverage = buildDayMuscleCoverage({
      planned: [{ sets: 3, ...pushdown }, { sets: 3, ...curl }],
      done: [{ sets: 6, ...pushdown }],
      muscleNames: names,
    });
    expect(coverage.muscles.find((m) => m.key === 'triceps')).toMatchObject({ percent: 100, remainingSets: 0 });
    expect(coverage.overallPercent).toBe(50);
  });

  it('flags muscles worked outside the plan as extra, with no percent', () => {
    const coverage = buildDayMuscleCoverage({
      planned: [{ sets: 3, ...pushdown }],
      done: [{ sets: 3, ...pushdown }, { sets: 2, ...curl }],
      muscleNames: names,
    });
    const biceps = coverage.muscles.find((m) => m.key === 'biceps');
    expect(biceps).toMatchObject({ extra: true, percent: null, plannedSets: 0, doneSets: 2 });
    expect(coverage.muscles[coverage.muscles.length - 1].key).toBe('biceps');
  });

  it('has no overall percent on a rest day and scales intensity to the most-worked muscle', () => {
    const coverage = buildDayMuscleCoverage({
      planned: [],
      done: [{ sets: 4, ...bench }],
      muscleNames: names,
    });
    expect(coverage.overallPercent).toBeNull();
    expect(coverage.regionIntensity).toEqual({ chest: 1, triceps: 0.5, shoulders: 0.5 });
  });

  it('adds up several sessions on the same day', () => {
    const coverage = buildDayMuscleCoverage({
      planned: [{ sets: 4, ...pushdown }],
      done: [{ sets: 2, ...pushdown }, { sets: 2, ...pushdown }],
      muscleNames: names,
    });
    expect(coverage.overallPercent).toBe(100);
  });

  it('treats a skipped exercise as nothing done', () => {
    const coverage = buildDayMuscleCoverage({
      planned: [{ sets: 3, ...curl }],
      done: [{ sets: 0, ...curl }],
      muscleNames: names,
    });
    expect(coverage.muscles).toHaveLength(1);
    expect(coverage.muscles[0]).toMatchObject({ doneSets: 0, remainingSets: 3, percent: 0 });
    expect(coverage.regionIntensity).toEqual({});
  });

  it('puts unfinished planned muscles before finished ones', () => {
    const coverage = buildDayMuscleCoverage({
      planned: [{ sets: 3, ...pushdown }, { sets: 3, ...curl }],
      done: [{ sets: 3, ...pushdown }],
      muscleNames: names,
    });
    expect(coverage.muscles.map((m) => m.key)).toEqual(['biceps', 'triceps']);
  });
});
