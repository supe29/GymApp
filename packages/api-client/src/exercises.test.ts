import { getExercisesWithTags, listMuscleGroups } from './exercises';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

describe('getExercisesWithTags (FR-4.2/FR-2.2)', () => {
  test('assembles exercises with primary/secondary muscles and required equipment', async () => {
    const { client, from } = createMockClient();

    from.mockImplementation((table: string) => {
      switch (table) {
        case 'exercises':
          return createQueryBuilderMock({
            data: [
              {
                id: 'ex-1',
                name: 'Bench Press',
                instructions: 'Push.',
                difficulty: 'beginner',
                category: 'strength',
                mechanic: 'compound',
              },
              // Row from a database without migration 0010: no category/mechanic columns.
              { id: 'ex-2', name: 'Squat', instructions: null, difficulty: 'intermediate' },
            ],
            error: null,
          });
        case 'exercise_muscles':
          return createQueryBuilderMock({
            data: [
              { exercise_id: 'ex-1', muscle_group_id: 'mg-chest', role: 'primary' },
              { exercise_id: 'ex-1', muscle_group_id: 'mg-triceps', role: 'secondary' },
              { exercise_id: 'ex-2', muscle_group_id: 'mg-quads', role: 'primary' },
            ],
            error: null,
          });
        case 'muscle_groups':
          return createQueryBuilderMock({
            data: [
              { id: 'mg-chest', key: 'chest' },
              { id: 'mg-triceps', key: 'triceps' },
              { id: 'mg-quads', key: 'quadriceps' },
            ],
            error: null,
          });
        case 'exercise_equipment':
          return createQueryBuilderMock({
            data: [{ exercise_id: 'ex-1', equipment_item_id: 'eq-barbell' }],
            error: null,
          });
        case 'equipment_items':
          return createQueryBuilderMock({
            data: [{ id: 'eq-barbell', key: 'barbell' }],
            error: null,
          });
        default:
          throw new Error(`unexpected table in test: ${table}`);
      }
    });

    const result = await getExercisesWithTags(client);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      {
        id: 'ex-1',
        name: 'Bench Press',
        instructions: 'Push.',
        difficulty: 'beginner',
        primaryMuscleKeys: ['chest'],
        secondaryMuscleKeys: ['triceps'],
        requiredEquipmentKeys: ['barbell'],
        category: 'strength',
        mechanic: 'compound',
      },
      {
        id: 'ex-2',
        name: 'Squat',
        instructions: null,
        difficulty: 'intermediate',
        primaryMuscleKeys: ['quadriceps'],
        secondaryMuscleKeys: [],
        requiredEquipmentKeys: [],
        category: null,
        mechanic: null,
      },
    ]);
  });

  test('surfaces the first error encountered across the parallel queries', async () => {
    const { client, from } = createMockClient();
    from.mockImplementation((table: string) =>
      table === 'exercises'
        ? createQueryBuilderMock({ data: null, error: { message: 'exercises query failed' } })
        : createQueryBuilderMock({ data: [], error: null }),
    );

    const result = await getExercisesWithTags(client);

    expect(result.data).toBeNull();
    expect(result.error).toBe('exercises query failed');
  });
});

describe('listMuscleGroups (FR-4.1)', () => {
  test('orders by display name', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: [{ id: 'mg-1', key: 'chest' }], error: null });
    from.mockReturnValue(builder);

    const result = await listMuscleGroups(client);

    expect(from).toHaveBeenCalledWith('muscle_groups');
    expect(builder.order).toHaveBeenCalledWith('display_name');
    expect(result.data).toEqual([{ id: 'mg-1', key: 'chest' }]);
  });
});
