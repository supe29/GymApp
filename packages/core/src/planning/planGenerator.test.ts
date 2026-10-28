import type { ExerciseWithTags } from '../content/exerciseQueries';
import type { FitnessLevel, Goal } from '../validation/profileValidation';
import { generatePlan, type PlanGeneratorInput } from './planGenerator';

const ALL_MUSCLE_GROUPS = [
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower_back',
  'middle_back',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
];

function exercise(partial: {
  id: string;
  primaryMuscleKeys: string[];
  difficulty: ExerciseWithTags['difficulty'];
  requiredEquipmentKeys?: string[];
}): ExerciseWithTags {
  return {
    id: partial.id,
    name: partial.id,
    instructions: null,
    difficulty: partial.difficulty,
    primaryMuscleKeys: partial.primaryMuscleKeys,
    secondaryMuscleKeys: [],
    requiredEquipmentKeys: partial.requiredEquipmentKeys ?? [],
  };
}

/**
 * One bodyweight (beginner) and one dumbbell (intermediate) exercise per
 * muscle group, except 'abdominals', which deliberately has ONLY an
 * advanced bodyweight exercise — exercising the SR-3 "no safer alternative
 * exists" fallback end-to-end through the real generator, not just the
 * difficultyGating unit.
 */
function buildFixtureLibrary(): ExerciseWithTags[] {
  const library: ExerciseWithTags[] = [];
  for (const muscle of ALL_MUSCLE_GROUPS) {
    if (muscle === 'abdominals') {
      library.push(
        exercise({ id: `${muscle}-advanced-bw`, primaryMuscleKeys: [muscle], difficulty: 'advanced' }),
      );
      continue;
    }
    library.push(
      exercise({ id: `${muscle}-beginner-bw`, primaryMuscleKeys: [muscle], difficulty: 'beginner' }),
      exercise({
        id: `${muscle}-intermediate-db`,
        primaryMuscleKeys: [muscle],
        difficulty: 'intermediate',
        requiredEquipmentKeys: ['dumbbell'],
      }),
      exercise({
        id: `${muscle}-advanced-barbell`,
        primaryMuscleKeys: [muscle],
        difficulty: 'advanced',
        requiredEquipmentKeys: ['barbell'],
      }),
    );
  }
  return library;
}

const FIXTURE_LIBRARY = buildFixtureLibrary();

const GOALS: Goal[] = ['fat_loss', 'muscle_gain', 'strength', 'general_fitness'];
const LEVELS: FitnessLevel[] = ['beginner', 'intermediate', 'advanced'];

function baseInput(overrides: Partial<PlanGeneratorInput> = {}): PlanGeneratorInput {
  return {
    goal: 'general_fitness',
    fitnessLevel: 'intermediate',
    trainingDaysPerWeek: 3,
    availableEquipmentKeys: ['dumbbell', 'barbell'],
    exerciseLibrary: FIXTURE_LIBRARY,
    ...overrides,
  };
}

describe('generatePlan (FR-2.1/FR-2.2/FR-2.3/SR-3/SR-6/NFR-7)', () => {
  test('produces sessions matching the selected split, with non-empty exercise lists', () => {
    const plan = generatePlan(baseInput());
    expect(plan.sessions.length).toBe(3);
    for (const session of plan.sessions) {
      expect(session.exercises.length).toBeGreaterThan(0);
      session.exercises.forEach((ex, i) => expect(ex.orderIndex).toBe(i));
    }
  });

  test('AC-2/SR-6: every prescribed exercise is compatible with bodyweight-only equipment', () => {
    for (const goal of GOALS) {
      for (const fitnessLevel of LEVELS) {
        for (const trainingDaysPerWeek of [1, 3, 5, 6]) {
          const plan = generatePlan(
            baseInput({ goal, fitnessLevel, trainingDaysPerWeek, availableEquipmentKeys: [] }),
          );
          for (const session of plan.sessions) {
            for (const ex of session.exercises) {
              const source = FIXTURE_LIBRARY.find((e) => e.id === ex.exerciseId);
              expect(source?.requiredEquipmentKeys).toEqual([]);
            }
          }
        }
      }
    }
  });

  test('AC-2/SR-6: every prescribed exercise is compatible with a declared equipment subset', () => {
    const plan = generatePlan(baseInput({ availableEquipmentKeys: ['dumbbell'] }));
    for (const session of plan.sessions) {
      for (const ex of session.exercises) {
        const source = FIXTURE_LIBRARY.find((e) => e.id === ex.exerciseId);
        expect(source?.requiredEquipmentKeys.every((k) => k === 'dumbbell')).toBe(true);
      }
    }
  });

  test('SR-3: beginner with a mixed-difficulty pool never gets an advanced exercise when a safer one exists', () => {
    const plan = generatePlan(
      baseInput({ fitnessLevel: 'beginner', availableEquipmentKeys: ['dumbbell', 'barbell'] }),
    );
    for (const session of plan.sessions) {
      for (const ex of session.exercises) {
        if (ex.provenance.muscleGroupTargeted === 'abdominals') continue;
        const source = FIXTURE_LIBRARY.find((e) => e.id === ex.exerciseId);
        expect(source?.difficulty).not.toBe('advanced');
      }
    }
  });

  test('SR-3: beginner falls back to the advanced exercise when it is the only option for the slot', () => {
    // Full-body's first slot targets 'quadriceps' (see splitDayTemplates.ts);
    // this library has only an advanced option for it, so the fallback is
    // exercised on the very first slot of the very first session.
    const library: ExerciseWithTags[] = [
      exercise({ id: 'quadriceps-advanced-bw', primaryMuscleKeys: ['quadriceps'], difficulty: 'advanced' }),
      exercise({ id: 'hamstrings-beginner-bw', primaryMuscleKeys: ['hamstrings'], difficulty: 'beginner' }),
    ];
    const plan = generatePlan(
      baseInput({
        fitnessLevel: 'beginner',
        trainingDaysPerWeek: 1,
        availableEquipmentKeys: [],
        exerciseLibrary: library,
      }),
    );
    const quadExercise = plan.sessions[0].exercises.find(
      (e) => e.provenance.muscleGroupTargeted === 'quadriceps',
    );
    expect(quadExercise?.exerciseId).toBe('quadriceps-advanced-bw');
    expect(quadExercise?.provenance.difficultyGate.usedAdvancedFallback).toBe(true);
    expect(quadExercise?.intensityNote).toContain('no safer alternative available');
  });

  test('SR-3: intermediate/advanced users are not over-restricted by the gate', () => {
    for (const fitnessLevel of ['intermediate', 'advanced'] as FitnessLevel[]) {
      const plan = generatePlan(baseInput({ fitnessLevel, availableEquipmentKeys: ['barbell'] }));
      const usedAdvanced = plan.sessions.some((s) => s.exercises.some((e) => e.exerciseId.includes('advanced')));
      expect(usedAdvanced).toBe(true);
    }
  });

  test('never prescribes a numeric target weight at generation time', () => {
    const plan = generatePlan(baseInput());
    for (const session of plan.sessions) {
      for (const ex of session.exercises) {
        expect(ex.targetWeightKg).toBeNull();
      }
    }
  });

  test('NFR-7: every prescribed exercise carries full provenance', () => {
    const plan = generatePlan(baseInput());
    for (const session of plan.sessions) {
      for (const ex of session.exercises) {
        expect(ex.provenance.splitRuleId).toBe(plan.splitRuleId);
        expect(ex.provenance.prescriptionRuleKey).toBe('general_fitness:intermediate');
        expect(ALL_MUSCLE_GROUPS).toContain(ex.provenance.muscleGroupTargeted);
        expect(ex.intensityNote).toContain(`split-rule=${plan.splitRuleId}`);
      }
    }
  });

  test('no slot is ever filled with a non-compliant exercise when the library has no compatible option (thinner session, not an error)', () => {
    const sparseLibrary = [
      exercise({ id: 'chest-only', primaryMuscleKeys: ['chest'], difficulty: 'beginner' }),
    ];
    expect(() =>
      generatePlan(baseInput({ exerciseLibrary: sparseLibrary, trainingDaysPerWeek: 1, fitnessLevel: 'beginner' })),
    ).not.toThrow();
    const plan = generatePlan(
      baseInput({ exerciseLibrary: sparseLibrary, trainingDaysPerWeek: 1, fitnessLevel: 'beginner' }),
    );
    for (const session of plan.sessions) {
      for (const ex of session.exercises) {
        expect(ex.exerciseId).toBe('chest-only');
      }
      expect(session.exercises.length).toBeLessThan(5);
    }
  });

  test('is deterministic regardless of the exercise library input order', () => {
    const shuffled = [...FIXTURE_LIBRARY].reverse();
    const planA = generatePlan(baseInput());
    const planB = generatePlan(baseInput({ exerciseLibrary: shuffled }));
    expect(planA).toEqual(planB);
  });

  test('is deterministic: calling twice with the same input produces an identical plan', () => {
    const input = baseInput();
    expect(generatePlan(input)).toEqual(generatePlan(input));
  });

  test('never reuses the same exercise twice within a single session', () => {
    const plan = generatePlan(baseInput({ fitnessLevel: 'advanced', availableEquipmentKeys: [] }));
    for (const session of plan.sessions) {
      const ids = session.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
