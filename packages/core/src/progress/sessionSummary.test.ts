import type { SetLogEntry } from '../logs/logAggregation';
import { buildSessionSummary, toAiFacts, type SessionSummaryInput } from './sessionSummary';

let logId = 0;
function log(exerciseId: string, weightKg: number | null, reps: number, overrides: Partial<SetLogEntry> = {}): SetLogEntry {
  logId += 1;
  return {
    id: `log-${logId}`,
    workoutSessionId: 'ws-now',
    exerciseId,
    setIndex: logId,
    weightKg,
    reps,
    rpe: null,
    loggedAt: '2026-11-11T10:30:00Z',
    ...overrides,
  };
}

const SQUAT = {
  exerciseId: 'ex-squat',
  name: 'Barbell Squat',
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  skipped: false,
  primaryMuscleKeys: ['quadriceps'],
  secondaryMuscleKeys: ['glutes', 'hamstrings'],
  mechanic: 'compound',
};
const CURL = {
  exerciseId: 'ex-curl',
  name: 'Dumbbell Curl',
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  skipped: false,
  primaryMuscleKeys: ['biceps'],
  secondaryMuscleKeys: ['forearms'],
  mechanic: 'isolation',
};

function input(overrides: Partial<SessionSummaryInput> = {}): SessionSummaryInput {
  return {
    sessionName: 'Full Body A',
    startedAt: '2026-11-11T10:00:00Z',
    completedAt: '2026-11-11T10:45:00Z',
    goal: 'muscle_gain',
    fitnessLevel: 'beginner',
    unitPreference: 'metric',
    exercises: [SQUAT, CURL],
    logs: [log('ex-squat', 60, 10), log('ex-squat', 60, 10), log('ex-squat', 60, 8), log('ex-curl', 10, 12), log('ex-curl', 10, 12), log('ex-curl', 10, 6)],
    priorLogs: [],
    muscleNames: { quadriceps: 'Quadriceps', glutes: 'Glutes', hamstrings: 'Hamstrings', biceps: 'Biceps', forearms: 'Forearms' },
    newPrs: [],
    progression: [],
    nextSession: null,
    ...overrides,
  };
}

describe('FR-8.4: buildSessionSummary', () => {
  test('per-exercise facts: sets, reps, top weight, volume, and whether the target was met', () => {
    const summary = buildSessionSummary(input());
    const [squat, curl] = summary.exercises;
    expect(squat).toMatchObject({ setsDone: 3, reps: [10, 10, 8], topWeightKg: 60, volumeKg: 1680, targetMet: true });
    expect(curl).toMatchObject({ setsDone: 3, reps: [12, 12, 6], volumeKg: 300, targetMet: false });
    expect(summary.totals).toEqual({ sets: 6, reps: 58, volumeKg: 1980, volumeChangeKg: null });
    expect(summary.durationMinutes).toBe(45);
  });

  test('compares volume with the most recent earlier session of each exercise', () => {
    const summary = buildSessionSummary(
      input({
        priorLogs: [
          log('ex-squat', 50, 10, { workoutSessionId: 'ws-old', loggedAt: '2026-11-01T10:00:00Z' }),
          log('ex-squat', 55, 10, { workoutSessionId: 'ws-last', loggedAt: '2026-11-08T10:00:00Z' }),
          log('ex-squat', 55, 10, { workoutSessionId: 'ws-last', loggedAt: '2026-11-08T10:05:00Z' }),
        ],
      }),
    );
    expect(summary.exercises[0].volumeChangeKg).toBe(1680 - 1100);
    expect(summary.exercises[1].volumeChangeKg).toBeNull();
    expect(summary.totals.volumeChangeKg).toBe(580);
    expect(summary.fallbackText.whatYouDid).toContain('(+580.0 kg vs last time)');
  });

  test('weights muscles by sets: primary counts 1, secondary 0.5', () => {
    const summary = buildSessionSummary(input());
    expect(summary.musclesWorked.slice(0, 2)).toEqual([
      { key: 'biceps', name: 'Biceps', weightedSets: 3 },
      { key: 'quadriceps', name: 'Quadriceps', weightedSets: 3 },
    ]);
    expect(summary.musclesWorked.find((m) => m.key === 'glutes')?.weightedSets).toBe(1.5);
    expect(summary.bodyHighlight.primary.sort()).toEqual(['biceps', 'quadriceps']);
    expect(summary.bodyHighlight.secondary.sort()).toEqual(['forearms', 'glutes', 'hamstrings']);
  });

  test("measures goal fit against the planner's own rep range for the goal and level", () => {
    const summary = buildSessionSummary(input());
    expect(summary.goalFit).toMatchObject({
      goal: 'muscle_gain',
      repRange: { min: 8, max: 12 },
      setsInRange: 5,
      workingSets: 6,
      compoundExercises: 1,
      isolationExercises: 1,
      allTargetsMet: false,
    });
    expect(summary.fallbackText.goalImpact).toContain('5 of 6 sets were in the 8–12 reps range your plan uses for muscle gain.');
    expect(summary.fallbackText.goalImpact).toContain('holds steady');
  });

  test('measures each set against its own prescription when the plan differs from the goal rule', () => {
    // general_fitness beginner rule is 10-12, but this plan prescribes 8-12.
    const summary = buildSessionSummary(input({ goal: 'general_fitness', logs: [log('ex-squat', 60, 8), log('ex-squat', 60, 8), log('ex-squat', 60, 8)], exercises: [SQUAT] }));
    expect(summary.goalFit).toMatchObject({ repRange: { min: 8, max: 12 }, setsInRange: 3, workingSets: 3, allTargetsMet: true });
    expect(summary.fallbackText.goalImpact).toContain('3 of 3 sets were in the 8–12 reps range');
  });

  test('mixed prescriptions are described as the plan rep ranges', () => {
    const summary = buildSessionSummary(input({ exercises: [SQUAT, { ...CURL, targetRepsMin: 12, targetRepsMax: 15 }] }));
    expect(summary.goalFit.repRange).toBeNull();
    expect(summary.goalFit.setsInRange).toBe(5);
    expect(summary.fallbackText.goalImpact).toContain('5 of 6 sets were inside the rep ranges your plan sets for muscle gain.');
  });

  test('freeform sets are measured against the goal rule', () => {
    const summary = buildSessionSummary(input({ exercises: [{ ...SQUAT, targetSets: 0 }], logs: [log('ex-squat', 60, 10), log('ex-squat', 60, 5)] }));
    expect(summary.goalFit).toMatchObject({ repRange: { min: 8, max: 12 }, setsInRange: 1, workingSets: 2, allTargetsMet: null });
  });

  test('a skipped exercise counts no sets or muscles and is listed as skipped', () => {
    const summary = buildSessionSummary(input({ exercises: [SQUAT, { ...CURL, skipped: true }], logs: [log('ex-squat', 60, 10)] }));
    expect(summary.exercises[1].skipped).toBe(true);
    expect(summary.musclesWorked.map((m) => m.key)).not.toContain('biceps');
    expect(summary.fallbackText.whatYouDid).toContain('Skipped: Dumbbell Curl.');
  });

  test('freeform: no prescription means no target verdict', () => {
    const summary = buildSessionSummary(
      input({ goal: null, fitnessLevel: null, exercises: [{ ...SQUAT, targetSets: 0 }], logs: [log('ex-squat', 60, 5)] }),
    );
    expect(summary.exercises[0].targetMet).toBeNull();
    expect(summary.goalFit.allTargetsMet).toBeNull();
    expect(summary.goalFit.repRange).toBeNull();
    expect(summary.fallbackText.goalImpact).toContain('Showing up');
  });

  test('next session: names overlapping muscles to rest, and lists the suggested changes', () => {
    const summary = buildSessionSummary(
      input({
        nextSession: {
          name: 'Full Body B',
          exercises: [{ name: 'Leg Press', primaryMuscleKeys: ['quadriceps'], secondaryMuscleKeys: ['glutes'] }],
        },
        progression: [
          { exerciseName: 'Barbell Squat', action: 'increase_weight', suggestedWeightKg: 62.5, suggestedReps: 8 },
          { exerciseName: 'Dumbbell Curl', action: 'hold', suggestedWeightKg: 10, suggestedReps: 8 },
        ],
      }),
    );
    expect(summary.nextSession).toEqual({ name: 'Full Body B', muscles: ['Quadriceps', 'Glutes'], overlapWithToday: ['Quadriceps'] });
    expect(summary.fallbackText.nextSession).toBe(
      'Next up: Full Body B. It trains your quadriceps again, so give them a day or two of rest first. Suggested changes: Barbell Squat up to 62.5 kg.',
    );
  });

  test('uses the unit preference in wording', () => {
    const summary = buildSessionSummary(input({ unitPreference: 'imperial' }));
    expect(summary.fallbackText.whatYouDid).toContain(' lb');
  });

  test('headline celebrates new PRs', () => {
    const summary = buildSessionSummary(input({ newPrs: [{ exerciseName: 'Barbell Squat', repCount: 10, weightKg: 60 }] }));
    expect(summary.fallbackText.headline).toBe('Full Body A done, with a new personal record.');
  });

  test('handles a session with no sets logged', () => {
    const summary = buildSessionSummary(input({ logs: [] }));
    expect(summary.totals.sets).toBe(0);
    expect(summary.fallbackText.whatYouDid).toBe('No sets were logged this session.');
    expect(summary.fallbackText.bodyImpact).toBe('No muscles were worked this session.');
  });
});

describe('AI-5: toAiFacts', () => {
  test('carries display values in the user unit and no personal identifiers', () => {
    const summary = buildSessionSummary(input({ unitPreference: 'imperial' }));
    const facts = toAiFacts(summary, 'imperial', 'beginner');
    expect(facts.goal).toBe('muscle gain');
    expect(facts.exercises[0].topWeight).toBe('132.3 lb');
    expect(facts.goalFit.repRange).toBe('8-12 reps');
    expect(JSON.stringify(facts)).not.toMatch(/email|userId|user_id|age/i);
  });
});
