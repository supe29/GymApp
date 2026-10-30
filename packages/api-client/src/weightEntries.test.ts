import { deleteWeightEntry, getWeightEntries, logWeightEntry } from './weightEntries';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

describe('logWeightEntry (FR-8.1)', () => {
  test('inserts the weight for the current user', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({
      data: { id: 'entry-1', user_id: 'user-1', weight_kg: 80.5, measured_at: '2026-10-28T08:00:00Z', created_at: '2026-10-28T08:00:00Z' },
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === 'weight_entries') return builder;
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await logWeightEntry(client, 'user-1', 80.5);

    expect(builder.insert).toHaveBeenCalledWith({ user_id: 'user-1', weight_kg: 80.5 });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 'entry-1', weightKg: 80.5, measuredAt: '2026-10-28T08:00:00Z' });
  });
});

describe('getWeightEntries (FR-8.1/AC-12)', () => {
  test('orders by measured_at and maps rows', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({
      data: [
        { id: 'e1', user_id: 'user-1', weight_kg: 80, measured_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z' },
        { id: 'e2', user_id: 'user-1', weight_kg: 79.5, measured_at: '2026-10-15T00:00:00Z', created_at: '2026-10-15T00:00:00Z' },
      ],
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === 'weight_entries') return builder;
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await getWeightEntries(client, 'user-1');

    expect(builder.order).toHaveBeenCalledWith('measured_at');
    expect(result.data).toEqual([
      { id: 'e1', weightKg: 80, measuredAt: '2026-10-01T00:00:00Z' },
      { id: 'e2', weightKg: 79.5, measuredAt: '2026-10-15T00:00:00Z' },
    ]);
  });
});

describe('deleteWeightEntry (FR-8.1)', () => {
  test('filters by id and user_id', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: null, error: null });
    from.mockReturnValue(builder);

    const result = await deleteWeightEntry(client, 'user-1', 'entry-1');

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'entry-1');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(result.error).toBeNull();
  });
});
