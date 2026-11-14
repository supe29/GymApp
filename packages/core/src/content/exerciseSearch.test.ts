import { searchExercises, type ExerciseWithTags } from './exerciseQueries';

function exercise(id: string, name: string, primary: string[], secondary: string[] = []): ExerciseWithTags {
  return {
    id,
    name,
    instructions: null,
    difficulty: 'beginner',
    primaryMuscleKeys: primary,
    secondaryMuscleKeys: secondary,
    requiredEquipmentKeys: [],
  };
}

const benchPress = exercise('bench', 'Barbell Bench Press', ['chest'], ['shoulders', 'triceps']);
const inclineBench = exercise('incline', 'Incline Dumbbell Bench Press', ['chest'], ['shoulders']);
const benchDip = exercise('bench-dip', 'Bench Dip', ['triceps'], ['chest']);
const pullUp = exercise('pull-up', 'Pull-Up', ['lats'], ['biceps']);
const goodMorning = exercise('good-morning', 'Good Morning', ['hamstrings'], ['lower_back']);
const pushUp = exercise('push-up', 'Push-Up', ['chest'], ['triceps']);
const ALL = [pushUp, goodMorning, pullUp, benchDip, inclineBench, benchPress];

const ids = (query: string, limit?: number) => searchExercises(ALL, query, { limit }).results.map((e) => e.id);

describe('searchExercises (FR-5.3)', () => {
  test('an empty query lists everything alphabetically', () => {
    expect(ids('   ')).toEqual(['bench', 'bench-dip', 'good-morning', 'incline', 'pull-up', 'push-up']);
  });

  test('matches the start of any word in the name, ignoring case', () => {
    expect(ids('PRESS')).toEqual(['bench', 'incline']);
    expect(ids('dumb')).toEqual(['incline']);
    expect(ids('ench')).toEqual([]);
  });

  test('treats hyphens and spaces alike', () => {
    expect(ids('pull up')).toEqual(['pull-up']);
    expect(ids('pullup')).toEqual([]);
    expect(ids('push-up')).toEqual(['push-up']);
  });

  test('every query word must match', () => {
    expect(ids('bench press')).toEqual(['bench', 'incline']);
    expect(ids('bench squat')).toEqual([]);
  });

  test('ranks names starting with the query first, then other name matches', () => {
    // "Bench Dip" starts with "bench"; the presses only contain it.
    expect(ids('bench')).toEqual(['bench-dip', 'bench', 'incline']);
  });

  test('matches muscles, primary before secondary, after name matches', () => {
    expect(ids('chest')).toEqual(['bench', 'incline', 'push-up', 'bench-dip']);
    expect(ids('lower back')).toEqual(['good-morning']);
    expect(ids('triceps')).toEqual(['bench-dip', 'bench', 'push-up']);
  });

  test('lets a query mix name and muscle words', () => {
    expect(ids('dip chest')).toEqual(['bench-dip']);
  });

  test('limits the results but reports the total', () => {
    const { results, total } = searchExercises(ALL, '', { limit: 2 });
    expect(results.map((e) => e.id)).toEqual(['bench', 'bench-dip']);
    expect(total).toBe(6);
  });

  test('reports no matches', () => {
    expect(searchExercises(ALL, 'zzz')).toEqual({ results: [], total: 0 });
  });
});
