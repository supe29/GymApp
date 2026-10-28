import type { ExerciseWithTags, GeneratedPlan } from 'core';

import {
  buildRegenerationPreview,
  createWorkoutPlan,
  generateInitialPlan,
  getCurrentPlan,
  getPlannedSessionById,
  type WorkoutPlanRow,
} from './plans';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

const fakePlanRow: WorkoutPlanRow = {
  id: 'plan-1',
  user_id: 'user-1',
  split_type: 'full_body',
  plan_version: 1,
  effective_from: '2026-01-01T00:00:00Z',
  superseded_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

function fakeGeneratedPlan(): GeneratedPlan {
  return {
    splitType: 'full_body',
    splitRuleId: 'split-02',
    sessions: [
      {
        dayOrder: 1,
        name: 'Full Body',
        exercises: [
          {
            exerciseId: 'ex-1',
            exerciseName: 'Squat',
            orderIndex: 0,
            targetSets: 3,
            targetRepsMin: 8,
            targetRepsMax: 12,
            targetWeightKg: null,
            intensityNote: 'Moderate resistance.',
            provenance: {
              splitRuleId: 'split-02',
              prescriptionRuleKey: 'general_fitness:beginner',
              sessionCompositionKey: 'full_body:beginner',
              muscleGroupTargeted: 'quadriceps',
              difficultyGate: {
                exercise: {
                  id: 'ex-1',
                  name: 'Squat',
                  instructions: null,
                  difficulty: 'beginner',
                  primaryMuscleKeys: ['quadriceps'],
                  secondaryMuscleKeys: [],
                  requiredEquipmentKeys: [],
                },
                gateApplied: false,
                avoidedAdvancedExerciseIds: [],
                usedAdvancedFallback: false,
              },
            },
          },
        ],
      },
    ],
    inputsSnapshot: {
      goal: 'general_fitness',
      fitnessLevel: 'beginner',
      trainingDaysPerWeek: 1,
      availableEquipmentKeys: [],
    },
  };
}

describe('createWorkoutPlan (FR-2.1/DR-5)', () => {
  test('inserts workout_plans, then planned_sessions, then planned_session_exercises, in order', async () => {
    const { client, from } = createMockClient();
    const planBuilder = createQueryBuilderMock({ data: fakePlanRow, error: null });
    const sessionsBuilder = createQueryBuilderMock({
      data: [{ id: 'session-1', workout_plan_id: 'plan-1', user_id: 'user-1', day_order: 1, name: 'Full Body', created_at: '2026-01-01T00:00:00Z' }],
      error: null,
    });
    const exercisesBuilder = createQueryBuilderMock({
      data: [
        {
          id: 'pse-1',
          planned_session_id: 'session-1',
          user_id: 'user-1',
          exercise_id: 'ex-1',
          order_index: 0,
          target_sets: 3,
          target_reps_min: 8,
          target_reps_max: 12,
          target_weight_kg: null,
          intensity_note: 'Moderate resistance.',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    });
    from
      .mockReturnValueOnce(planBuilder)
      .mockReturnValueOnce(sessionsBuilder)
      .mockReturnValueOnce(exercisesBuilder);

    const result = await createWorkoutPlan(client, 'user-1', fakeGeneratedPlan());

    expect(from).toHaveBeenNthCalledWith(1, 'workout_plans');
    expect(from).toHaveBeenNthCalledWith(2, 'planned_sessions');
    expect(from).toHaveBeenNthCalledWith(3, 'planned_session_exercises');
    expect(planBuilder.insert).toHaveBeenCalledWith({ user_id: 'user-1', split_type: 'full_body' });
    expect(result.error).toBeNull();
    expect(result.data?.sessions[0].exercises[0].exerciseName).toBe('Squat');
  });

  test('never passes plan_version on insert', async () => {
    const { client, from } = createMockClient();
    const planBuilder = createQueryBuilderMock({ data: fakePlanRow, error: null });
    from
      .mockReturnValueOnce(planBuilder)
      .mockReturnValueOnce(createQueryBuilderMock({ data: [], error: null }));

    await createWorkoutPlan(client, 'user-1', { ...fakeGeneratedPlan(), sessions: [] });

    const insertedPayload = (planBuilder.insert as jest.Mock).mock.calls[0][0];
    expect(insertedPayload).not.toHaveProperty('plan_version');
  });

  test('returns early without calling planned_session_exercises insert when the sessions insert fails', async () => {
    const { client, from } = createMockClient();
    const planBuilder = createQueryBuilderMock({ data: fakePlanRow, error: null });
    const sessionsBuilder = createQueryBuilderMock({ data: null, error: { message: 'sessions insert failed' } });
    from.mockReturnValueOnce(planBuilder).mockReturnValueOnce(sessionsBuilder);

    const result = await createWorkoutPlan(client, 'user-1', fakeGeneratedPlan());

    expect(result.error).toBe('sessions insert failed');
    expect(from).toHaveBeenCalledTimes(2);
  });

  test('DR-5 regression: never calls update or delete against workout_plans', async () => {
    const { client, from } = createMockClient();
    const planBuilder = createQueryBuilderMock({ data: fakePlanRow, error: null });
    from
      .mockReturnValueOnce(planBuilder)
      .mockReturnValueOnce(createQueryBuilderMock({ data: [], error: null }));

    await createWorkoutPlan(client, 'user-1', { ...fakeGeneratedPlan(), sessions: [] });

    expect(planBuilder.update).not.toHaveBeenCalled();
    expect(planBuilder.delete).not.toHaveBeenCalled();
  });
});

describe('getCurrentPlan (FR-2.4)', () => {
  test('filters to the non-superseded row, ordered by plan_version desc, limited to 1', async () => {
    const { client, from } = createMockClient();
    const planBuilder = createQueryBuilderMock({ data: fakePlanRow, error: null });
    from
      .mockReturnValueOnce(planBuilder)
      .mockReturnValueOnce(createQueryBuilderMock({ data: [], error: null }));

    await getCurrentPlan(client, 'user-1');

    expect(planBuilder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(planBuilder.is).toHaveBeenCalledWith('superseded_at', null);
    expect(planBuilder.order).toHaveBeenCalledWith('plan_version', { ascending: false });
    expect(planBuilder.limit).toHaveBeenCalledWith(1);
  });

  test('returns null data (not an error) when the user has no plan yet', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(createQueryBuilderMock({ data: null, error: null }));

    const result = await getCurrentPlan(client, 'user-1');

    expect(result).toEqual({ data: null, error: null });
  });

  test('assembles sessions and exercises (with names joined from exercises) for an existing plan', async () => {
    const { client, from } = createMockClient();
    from
      .mockReturnValueOnce(createQueryBuilderMock({ data: fakePlanRow, error: null }))
      .mockReturnValueOnce(
        createQueryBuilderMock({
          data: [{ id: 'session-1', workout_plan_id: 'plan-1', user_id: 'user-1', day_order: 1, name: 'Full Body', created_at: '2026-01-01T00:00:00Z' }],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        createQueryBuilderMock({
          data: [
            {
              id: 'pse-1',
              planned_session_id: 'session-1',
              user_id: 'user-1',
              exercise_id: 'ex-1',
              order_index: 0,
              target_sets: 3,
              target_reps_min: 8,
              target_reps_max: 12,
              target_weight_kg: null,
              intensity_note: 'note',
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(createQueryBuilderMock({ data: [{ id: 'ex-1', name: 'Squat' }], error: null }));

    const result = await getCurrentPlan(client, 'user-1');

    expect(result.data?.planVersion).toBe(1);
    expect(result.data?.sessions[0].exercises[0].exerciseName).toBe('Squat');
  });
});

describe('generateInitialPlan (AC-1)', () => {
  test('generates and persists a real plan from fetched profile/equipment/library data', async () => {
    const { client, from } = createMockClient();
    const exerciseLibrary: ExerciseWithTags[] = [
      {
        id: 'ex-1',
        name: 'Squat',
        instructions: null,
        difficulty: 'beginner',
        primaryMuscleKeys: ['quadriceps'],
        secondaryMuscleKeys: [],
        requiredEquipmentKeys: [],
      },
    ];
    from
      // getProfile
      .mockReturnValueOnce(
        createQueryBuilderMock({
          data: {
            user_id: 'user-1',
            age: 25,
            height_cm: 180,
            weight_kg: 80,
            biological_sex: 'prefer_not_to_say',
            fitness_level: 'beginner',
            goal: 'general_fitness',
            training_days_per_week: 1,
            unit_preference: 'metric',
            created_at: '',
            updated_at: '',
          },
          error: null,
        }),
      )
      // getUserEquipmentIds
      .mockReturnValueOnce(createQueryBuilderMock({ data: [], error: null }))
      // listEquipmentItems
      .mockReturnValueOnce(createQueryBuilderMock({ data: [], error: null }))
      // getExercisesWithTags (5 parallel queries: exercises, exercise_muscles, muscle_groups, exercise_equipment, equipment_items)
      .mockReturnValueOnce(createQueryBuilderMock({ data: exerciseLibrary.map((e) => ({ id: e.id, name: e.name, instructions: e.instructions, difficulty: e.difficulty })), error: null }))
      .mockReturnValueOnce(createQueryBuilderMock({ data: [{ exercise_id: 'ex-1', muscle_group_id: 'mg-quad', role: 'primary' }], error: null }))
      .mockReturnValueOnce(createQueryBuilderMock({ data: [{ id: 'mg-quad', key: 'quadriceps' }], error: null }))
      .mockReturnValueOnce(createQueryBuilderMock({ data: [], error: null }))
      .mockReturnValueOnce(createQueryBuilderMock({ data: [], error: null }))
      // createWorkoutPlan: workout_plans insert
      .mockReturnValueOnce(createQueryBuilderMock({ data: fakePlanRow, error: null }))
      // createWorkoutPlan: planned_sessions insert
      .mockReturnValueOnce(
        createQueryBuilderMock({
          data: [{ id: 'session-1', workout_plan_id: 'plan-1', user_id: 'user-1', day_order: 1, name: 'Full Body', created_at: '' }],
          error: null,
        }),
      )
      // createWorkoutPlan: planned_session_exercises insert
      .mockReturnValueOnce(
        createQueryBuilderMock({
          data: [
            {
              id: 'pse-1',
              planned_session_id: 'session-1',
              user_id: 'user-1',
              exercise_id: 'ex-1',
              order_index: 0,
              target_sets: 3,
              target_reps_min: 10,
              target_reps_max: 12,
              target_weight_kg: null,
              intensity_note: 'note',
              created_at: '',
            },
          ],
          error: null,
        }),
      );

    const result = await generateInitialPlan(client, 'user-1');

    expect(result.error).toBeNull();
    expect(result.data?.sessions[0].exercises[0].exerciseId).toBe('ex-1');
  });
});

describe('buildRegenerationPreview (FR-2.4)', () => {
  test('never calls insert, update, or delete on any table', async () => {
    const { client, from } = createMockClient();
    const queryBuilders: ReturnType<typeof createQueryBuilderMock>[] = [];
    from.mockImplementation(() => {
      const builder = createQueryBuilderMock({ data: [], error: null });
      queryBuilders.push(builder);
      return builder;
    });

    // getProfile needs a profile row to avoid an early error return; override the first call.
    const profileBuilder = createQueryBuilderMock({
      data: {
        user_id: 'user-1',
        age: 25,
        height_cm: 180,
        weight_kg: 80,
        biological_sex: 'prefer_not_to_say',
        fitness_level: 'beginner',
        goal: 'general_fitness',
        training_days_per_week: 1,
        unit_preference: 'metric',
        created_at: '',
        updated_at: '',
      },
      error: null,
    });
    from.mockReset();
    from.mockReturnValueOnce(profileBuilder).mockImplementation(() => {
      const builder = createQueryBuilderMock({ data: [], error: null });
      queryBuilders.push(builder);
      return builder;
    });

    await buildRegenerationPreview(client, 'user-1');

    for (const builder of [profileBuilder, ...queryBuilders]) {
      expect(builder.insert).not.toHaveBeenCalled();
      expect(builder.update).not.toHaveBeenCalled();
      expect(builder.delete).not.toHaveBeenCalled();
    }
  });
});

describe('getPlannedSessionById (FR-5.2, Phase 7)', () => {
  test('fetches the session scoped to user_id and its prescribed exercises with joined names', async () => {
    const { client, from } = createMockClient();
    from
      .mockReturnValueOnce(
        createQueryBuilderMock({
          data: { id: 'session-1', workout_plan_id: 'plan-1', user_id: 'user-1', day_order: 1, name: 'Full Body', created_at: '' },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        createQueryBuilderMock({
          data: [
            {
              id: 'pse-1',
              planned_session_id: 'session-1',
              user_id: 'user-1',
              exercise_id: 'ex-1',
              order_index: 0,
              target_sets: 3,
              target_reps_min: 8,
              target_reps_max: 12,
              target_weight_kg: null,
              intensity_note: 'note',
              created_at: '',
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(createQueryBuilderMock({ data: [{ id: 'ex-1', name: 'Squat' }], error: null }));

    const result = await getPlannedSessionById(client, 'user-1', 'session-1');

    expect(result.data?.exercises[0].exerciseName).toBe('Squat');
    expect(result.data?.workoutPlanId).toBe('plan-1');
  });

  test('returns null data (not an error) when the session does not exist or is not owned by this user', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(createQueryBuilderMock({ data: null, error: null }));

    const result = await getPlannedSessionById(client, 'user-1', 'session-1');

    expect(result).toEqual({ data: null, error: null });
  });
});
