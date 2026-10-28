import { diffPlans, toComparablePlan, type ComparablePlan } from './versioning';
import { generatePlan } from './planGenerator';
import type { ExerciseWithTags } from '../content/exerciseQueries';

function plan(overrides: Partial<ComparablePlan> = {}): ComparablePlan {
  return {
    splitType: 'full_body',
    sessions: [
      {
        dayOrder: 1,
        name: 'Full Body',
        exercises: [
          { exerciseId: 'ex-1', exerciseName: 'Squat', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 },
          { exerciseId: 'ex-2', exerciseName: 'Bench Press', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('diffPlans (FR-2.4)', () => {
  test('identical plans produce an all-unchanged diff with zero counts', () => {
    const p = plan();
    const diff = diffPlans(p, p);
    expect(diff.splitTypeChanged).toBe(false);
    expect(diff.sessionDiffs).toHaveLength(1);
    expect(diff.sessionDiffs[0].changeType).toBe('unchanged');
    expect(diff.sessionDiffs[0].exerciseChanges.every((c) => c.changeType === 'unchanged')).toBe(true);
    expect(diff.summaryCounts).toEqual({
      sessionsAdded: 0,
      sessionsRemoved: 0,
      exercisesAdded: 0,
      exercisesRemoved: 0,
      prescriptionsChanged: 0,
    });
  });

  test('detects a split-type change', () => {
    const diff = diffPlans(plan({ splitType: 'full_body' }), plan({ splitType: 'upper_lower' }));
    expect(diff.splitTypeChanged).toBe(true);
    expect(diff.previousSplitType).toBe('full_body');
    expect(diff.nextSplitType).toBe('upper_lower');
  });

  test('detects an exercise added within an existing session', () => {
    const previous = plan();
    const next = plan({
      sessions: [
        {
          dayOrder: 1,
          name: 'Full Body',
          exercises: [
            ...previous.sessions[0].exercises,
            { exerciseId: 'ex-3', exerciseName: 'Row', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 },
          ],
        },
      ],
    });
    const diff = diffPlans(previous, next);
    expect(diff.summaryCounts.exercisesAdded).toBe(1);
    expect(diff.sessionDiffs[0].changeType).toBe('modified');
    const added = diff.sessionDiffs[0].exerciseChanges.find((c) => c.exerciseId === 'ex-3');
    expect(added?.changeType).toBe('added');
  });

  test('detects an exercise removed from an existing session', () => {
    const previous = plan();
    const next = plan({
      sessions: [{ dayOrder: 1, name: 'Full Body', exercises: [previous.sessions[0].exercises[0]] }],
    });
    const diff = diffPlans(previous, next);
    expect(diff.summaryCounts.exercisesRemoved).toBe(1);
    const removed = diff.sessionDiffs[0].exerciseChanges.find((c) => c.exerciseId === 'ex-2');
    expect(removed?.changeType).toBe('removed');
  });

  test('detects a prescription-only change on the same exercise', () => {
    const previous = plan();
    const next = plan({
      sessions: [
        {
          dayOrder: 1,
          name: 'Full Body',
          exercises: [
            { ...previous.sessions[0].exercises[0], targetSets: 5, targetRepsMin: 3, targetRepsMax: 5 },
            previous.sessions[0].exercises[1],
          ],
        },
      ],
    });
    const diff = diffPlans(previous, next);
    expect(diff.summaryCounts.prescriptionsChanged).toBe(1);
    const changed = diff.sessionDiffs[0].exerciseChanges.find((c) => c.exerciseId === 'ex-1');
    expect(changed?.changeType).toBe('prescription_changed');
    expect(changed?.previous).toMatchObject({ targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 });
    expect(changed?.next).toMatchObject({ targetSets: 5, targetRepsMin: 3, targetRepsMax: 5 });
  });

  test('detects an added session (new dayOrder not present before)', () => {
    const previous = plan();
    const next = plan({
      sessions: [...previous.sessions, { dayOrder: 2, name: 'Full Body B', exercises: [] }],
    });
    const diff = diffPlans(previous, next);
    expect(diff.summaryCounts.sessionsAdded).toBe(1);
    expect(diff.sessionDiffs.find((s) => s.dayOrder === 2)?.changeType).toBe('added');
  });

  test('detects a removed session (dayOrder present before but not after)', () => {
    const previous = plan({
      sessions: [...plan().sessions, { dayOrder: 2, name: 'Full Body B', exercises: [] }],
    });
    const next = plan();
    const diff = diffPlans(previous, next);
    expect(diff.summaryCounts.sessionsRemoved).toBe(1);
    expect(diff.sessionDiffs.find((s) => s.dayOrder === 2)?.changeType).toBe('removed');
  });

  test('toComparablePlan strips a real GeneratedPlan down to the comparable shape', () => {
    const library: ExerciseWithTags[] = [
      {
        id: 'sq-1',
        name: 'Squat',
        instructions: null,
        difficulty: 'beginner',
        primaryMuscleKeys: ['quadriceps'],
        secondaryMuscleKeys: [],
        requiredEquipmentKeys: [],
      },
    ];
    const generated = generatePlan({
      goal: 'general_fitness',
      fitnessLevel: 'beginner',
      trainingDaysPerWeek: 1,
      availableEquipmentKeys: [],
      exerciseLibrary: library,
    });
    const comparable = toComparablePlan(generated);
    expect(comparable.splitType).toBe(generated.splitType);
    expect(comparable.sessions[0].exercises[0]).toEqual({
      exerciseId: 'sq-1',
      exerciseName: 'Squat',
      targetSets: generated.sessions[0].exercises[0].targetSets,
      targetRepsMin: generated.sessions[0].exercises[0].targetRepsMin,
      targetRepsMax: generated.sessions[0].exercises[0].targetRepsMax,
    });
  });
});
