import {
  type ExerciseWithTags,
  filterByDifficulty,
  filterByEquipmentSubset,
  filterByMuscleGroup,
} from './exerciseQueries';

const benchPress: ExerciseWithTags = {
  id: 'bench-press',
  name: 'Barbell Bench Press',
  instructions: null,
  difficulty: 'beginner',
  primaryMuscleKeys: ['chest'],
  secondaryMuscleKeys: ['shoulders', 'triceps'],
  requiredEquipmentKeys: ['barbell'],
};

const pushup: ExerciseWithTags = {
  id: 'pushup',
  name: 'Push-Up',
  instructions: null,
  difficulty: 'beginner',
  primaryMuscleKeys: ['chest'],
  secondaryMuscleKeys: ['shoulders', 'triceps'],
  requiredEquipmentKeys: [],
};

const legPress: ExerciseWithTags = {
  id: 'leg-press',
  name: 'Leg Press',
  instructions: null,
  difficulty: 'intermediate',
  primaryMuscleKeys: ['quadriceps'],
  secondaryMuscleKeys: ['glutes'],
  requiredEquipmentKeys: ['machine'],
};

const frontLever: ExerciseWithTags = {
  id: 'front-lever',
  name: 'Front Lever',
  instructions: null,
  difficulty: 'advanced',
  primaryMuscleKeys: ['lats'],
  secondaryMuscleKeys: ['abdominals'],
  requiredEquipmentKeys: [],
};

const all = [benchPress, pushup, legPress, frontLever];

describe('filterByMuscleGroup (FR-4.2)', () => {
  test('returns exercises where the muscle is primary', () => {
    expect(filterByMuscleGroup(all, 'quadriceps')).toEqual([legPress]);
  });

  test('returns exercises where the muscle is secondary', () => {
    const result = filterByMuscleGroup(all, 'shoulders');
    expect(result.map((e) => e.id).sort()).toEqual(['bench-press', 'pushup']);
  });

  test('returns an empty array when no exercise targets the muscle', () => {
    expect(filterByMuscleGroup(all, 'forearms')).toEqual([]);
  });
});

describe('filterByEquipmentSubset (FR-2.2/SR-6)', () => {
  test('excludes exercises requiring equipment not in the available set', () => {
    const result = filterByEquipmentSubset(all, []);
    expect(result.map((e) => e.id).sort()).toEqual(['front-lever', 'pushup']);
  });

  test('includes an exercise once its required equipment is available', () => {
    const result = filterByEquipmentSubset(all, ['barbell']);
    expect(result.map((e) => e.id)).toContain('bench-press');
  });

  test('having extra available equipment beyond what is required is fine', () => {
    const result = filterByEquipmentSubset(all, ['barbell', 'machine', 'kettlebell']);
    expect(result.map((e) => e.id).sort()).toEqual(
      ['bench-press', 'front-lever', 'leg-press', 'pushup'].sort(),
    );
  });

  test('an exercise requiring no equipment is always included', () => {
    expect(filterByEquipmentSubset(all, ['anything'])).toEqual(
      expect.arrayContaining([pushup, frontLever]),
    );
  });
});

describe('filterByDifficulty', () => {
  test('returns only exercises at the exact requested difficulty', () => {
    expect(
      filterByDifficulty(all, 'beginner')
        .map((e) => e.id)
        .sort(),
    ).toEqual(['bench-press', 'pushup'].sort());
    expect(filterByDifficulty(all, 'intermediate')).toEqual([legPress]);
    expect(filterByDifficulty(all, 'advanced')).toEqual([frontLever]);
  });
});
