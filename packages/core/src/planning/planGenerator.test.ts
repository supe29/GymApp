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

describe('generatePlan exercise selection quality', () => {
  function named(
    name: string,
    muscle: string,
    extra: Partial<Pick<ExerciseWithTags, 'category' | 'mechanic' | 'requiredEquipmentKeys'>> = {},
  ): ExerciseWithTags {
    return {
      ...exercise({ id: name, primaryMuscleKeys: [muscle], difficulty: 'beginner' }),
      ...extra,
    };
  }

  test('never prescribes stretching, cardio, plyometric, olympic or strongman exercises', () => {
    const library = ALL_MUSCLE_GROUPS.flatMap((muscle) => [
      named(`${muscle}-stretch`, muscle, { category: 'stretching' }),
      named(`${muscle}-plyo`, muscle, { category: 'plyometrics' }),
      named(`${muscle}-olympic`, muscle, { category: 'olympic_weightlifting' }),
      named(`${muscle}-strongman`, muscle, { category: 'strongman' }),
      named(`${muscle}-cardio`, muscle, { category: 'cardio' }),
      named(`${muscle}-lift`, muscle, { category: 'strength' }),
    ]);
    const plan = generatePlan(baseInput({ exerciseLibrary: library, availableEquipmentKeys: [] }));
    const names = plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseName));
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => n.endsWith('-lift'))).toBe(true);
  });

  test('prefers staple lifts over obscure variations for the same muscle', () => {
    const library = [
      named('Alternating Floor Press', 'chest', { category: 'powerlifting', mechanic: 'compound' }),
      named('Barbell Bench Press - Medium Grip', 'chest', {
        category: 'strength',
        mechanic: 'compound',
      }),
    ];
    const plan = generatePlan(
      baseInput({
        goal: 'strength',
        trainingDaysPerWeek: 6,
        exerciseLibrary: library,
        availableEquipmentKeys: [],
      }),
    );
    const push = plan.sessions.find((s) => s.exercises.length > 0)!;
    expect(push.exercises[0].exerciseName).toBe('Barbell Bench Press - Medium Grip');
  });

  test('repeated days (A/B) rotate to different exercises when the library allows', () => {
    const plan = generatePlan(baseInput({ trainingDaysPerWeek: 4 }));
    expect(plan.splitType).toBe('upper_lower');
    const [upperA, , upperB] = plan.sessions;
    const aIds = upperA.exercises.map((e) => e.exerciseId);
    const bIds = upperB.exercises.map((e) => e.exerciseId);
    expect(aIds.some((id) => !bIds.includes(id))).toBe(true);
    expect(bIds.filter((id) => aIds.includes(id))).toEqual([]);
  });

  test('isolation exercises get at most 3 sets and at least an 8-12 rep range', () => {
    const library = ALL_MUSCLE_GROUPS.map((muscle) =>
      named(`${muscle}-iso`, muscle, { mechanic: 'isolation' }),
    );
    const plan = generatePlan(
      baseInput({
        goal: 'strength',
        fitnessLevel: 'advanced',
        exerciseLibrary: library,
        availableEquipmentKeys: [],
      }),
    );
    for (const e of plan.sessions.flatMap((s) => s.exercises)) {
      expect(e.targetSets).toBeLessThanOrEqual(3);
      expect(e.targetRepsMin).toBeGreaterThanOrEqual(8);
      expect(e.targetRepsMax).toBeGreaterThanOrEqual(12);
    }
  });
});

describe('generatePlan session fill', () => {
  test('a muscle group with no compatible exercise does not leave the session short', () => {
    // Only quadriceps and glutes have bodyweight options; the rest of the
    // Lower template needs equipment the user doesn't have.
    const library = [
      ...['quadriceps', 'glutes'].flatMap((muscle) =>
        [1, 2, 3].map((n) => exercise({ id: `${muscle}-bw-${n}`, primaryMuscleKeys: [muscle], difficulty: 'beginner' })),
      ),
      ...['hamstrings', 'calves', 'adductors', 'abductors', 'abdominals', 'lower_back'].map((muscle) =>
        exercise({ id: `${muscle}-machine`, primaryMuscleKeys: [muscle], difficulty: 'beginner', requiredEquipmentKeys: ['machine'] }),
      ),
    ];
    const plan = generatePlan(
      baseInput({ trainingDaysPerWeek: 4, exerciseLibrary: library, availableEquipmentKeys: [] }),
    );
    const lower = plan.sessions.find((s) => s.name.startsWith('Lower'))!;
    expect(lower.exercises).toHaveLength(6);
    expect(lower.exercises.every((e) => e.exerciseId.includes('-bw-'))).toBe(true);
  });
});

describe('generatePlan session fill and SR-3', () => {
  test('fill passes never add an advanced exercise for a beginner just to lengthen a session', () => {
    const library = [
      exercise({ id: 'quads-safe', primaryMuscleKeys: ['quadriceps'], difficulty: 'beginner' }),
      exercise({ id: 'quads-advanced', primaryMuscleKeys: ['quadriceps'], difficulty: 'advanced' }),
    ];
    const plan = generatePlan(
      baseInput({ fitnessLevel: 'beginner', trainingDaysPerWeek: 3, exerciseLibrary: library, availableEquipmentKeys: [] }),
    );
    const ids = plan.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
    expect(ids).toContain('quads-safe');
    expect(ids).not.toContain('quads-advanced');
  });
});

describe('FR-2.7: generatePlan with day plans', () => {
  const ABS_LIBRARY = [
    ...FIXTURE_LIBRARY,
    exercise({ id: 'abdominals-beginner-a', primaryMuscleKeys: ['abdominals'], difficulty: 'beginner' }),
    exercise({ id: 'abdominals-beginner-b', primaryMuscleKeys: ['abdominals'], difficulty: 'beginner' }),
  ];

  test('each session follows its day plan: muscles, name, and A/B suffix for repeats', () => {
    const plan = generatePlan(
      baseInput({
        trainingDaysPerWeek: 4,
        dayPlans: [
          { focus: ['push'], core: true },
          { focus: ['pull', 'legs'], core: false },
          { focus: ['push'], core: true },
          { focus: ['lower'], core: false },
        ],
        dayPlanRule: 'custom',
      }),
    );
    expect(plan.sessions.map((s) => s.name)).toEqual(['Push + Core A', 'Pull + Legs', 'Push + Core B', 'Lower']);
    expect(plan.splitType).toBe('custom');

    const pushMuscles = new Set(['chest', 'shoulders', 'triceps', 'abdominals']);
    for (const ex of plan.sessions[0].exercises) expect(pushMuscles.has(ex.provenance.muscleGroupTargeted)).toBe(true);

    const pullLegs = plan.sessions[1].exercises.map((e) => e.provenance.muscleGroupTargeted);
    expect(pullLegs).toEqual(expect.arrayContaining(['lats', 'quadriceps']));
    expect(plan.sessions[1].exercises.every((e) => e.provenance.dayPlanRule === 'custom')).toBe(true);
  });

  test('a core day ends with dedicated ab exercises (2 for intermediate) on top of the usual count', () => {
    const plan = generatePlan(
      baseInput({ exerciseLibrary: ABS_LIBRARY, trainingDaysPerWeek: 2, dayPlans: [{ focus: ['upper'], core: true }, { focus: ['upper'], core: false }] }),
    );
    const [withCore, without] = plan.sessions;
    const tail = withCore.exercises.slice(-2);
    expect(tail.every((e) => e.provenance.muscleGroupTargeted === 'abdominals' && e.provenance.coreFinisher)).toBe(true);
    expect(withCore.exercises.length).toBe(without.exercises.length + 2);
    expect(withCore.exercises.slice(0, -2).some((e) => e.provenance.muscleGroupTargeted === 'abdominals')).toBe(false);
    expect(tail[0].intensityNote).toContain('core finisher');
  });

  test('SR-3 still applies to core finishers: a beginner gets a beginner ab exercise when one exists', () => {
    const plan = generatePlan(
      baseInput({ fitnessLevel: 'beginner', exerciseLibrary: ABS_LIBRARY, trainingDaysPerWeek: 1, dayPlans: [{ focus: ['push'], core: true }] }),
    );
    const core = plan.sessions[0].exercises.filter((e) => e.provenance.coreFinisher);
    expect(core).toHaveLength(1);
    expect(core[0].exerciseId).toMatch(/^abdominals-beginner/);
  });

  test('named-family day plans keep the named split type', () => {
    const ul = generatePlan(baseInput({ trainingDaysPerWeek: 2, dayPlans: [{ focus: ['upper'], core: false }, { focus: ['lower'], core: false }] }));
    expect(ul.splitType).toBe('upper_lower');
  });

  test('without day plans the FR-2.1 templates are used, unchanged', () => {
    const plain = generatePlan(baseInput());
    expect(plain.sessions.every((s) => s.exercises.every((e) => e.provenance.dayPlanRule === undefined))).toBe(true);
  });

  test('is deterministic with day plans', () => {
    const input = baseInput({ trainingDaysPerWeek: 2, dayPlans: [{ focus: ['push'], core: true }, { focus: ['pull', 'legs'], core: false }] });
    expect(generatePlan(input)).toEqual(generatePlan(input));
  });
});
