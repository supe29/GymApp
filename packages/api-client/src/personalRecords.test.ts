import { createPersonalRecord, getPersonalRecordsForUser } from './personalRecords';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

describe('createPersonalRecord (FR-8.2)', () => {
  test('inserts the derived PR fields', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({
      data: {
        id: 'pr-1',
        user_id: 'user-1',
        exercise_id: 'ex-squat',
        set_log_id: 'log-1',
        rep_count: 5,
        weight_kg: 110,
        estimated_one_rm: 128.3,
        achieved_at: '2026-10-28T08:00:00Z',
        created_at: '2026-10-28T08:00:00Z',
      },
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === 'personal_records') return builder;
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await createPersonalRecord(client, 'user-1', {
      exerciseId: 'ex-squat',
      repCount: 5,
      weightKg: 110,
      estimatedOneRm: 128.3,
      setLogId: 'log-1',
      achievedAt: '2026-10-28T08:00:00Z',
    });

    expect(builder.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      exercise_id: 'ex-squat',
      set_log_id: 'log-1',
      rep_count: 5,
      weight_kg: 110,
      estimated_one_rm: 128.3,
    });
    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('pr-1');
  });
});

describe('getPersonalRecordsForUser (FR-8.2)', () => {
  test('fetches the full history for the user, joined with exercise names', async () => {
    const { client, from } = createMockClient();
    from.mockImplementation((table: string) => {
      if (table === 'personal_records') {
        return createQueryBuilderMock({
          data: [
            {
              id: 'pr-1',
              user_id: 'user-1',
              exercise_id: 'ex-squat',
              set_log_id: 'log-1',
              rep_count: 5,
              weight_kg: 110,
              estimated_one_rm: 128.3,
              achieved_at: '2026-10-28T08:00:00Z',
              created_at: '2026-10-28T08:00:00Z',
            },
          ],
          error: null,
        });
      }
      if (table === 'exercises') {
        return createQueryBuilderMock({ data: [{ id: 'ex-squat', name: 'Squat' }], error: null });
      }
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await getPersonalRecordsForUser(client, 'user-1');

    expect(result.data).toEqual([
      {
        id: 'pr-1',
        exerciseId: 'ex-squat',
        exerciseName: 'Squat',
        setLogId: 'log-1',
        repCount: 5,
        weightKg: 110,
        estimatedOneRm: 128.3,
        achievedAt: '2026-10-28T08:00:00Z',
      },
    ]);
  });

  test('skips the exercises query entirely when there is no PR history', async () => {
    const { client, from } = createMockClient();
    from.mockImplementation((table: string) => {
      if (table === 'personal_records') return createQueryBuilderMock({ data: [], error: null });
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await getPersonalRecordsForUser(client, 'user-1');

    expect(result.data).toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
