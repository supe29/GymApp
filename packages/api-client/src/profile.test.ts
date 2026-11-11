import {
  createProfile,
  getProfile,
  getUserEquipmentIds,
  listEquipmentItems,
  ProfileRow,
  requestAccountDeletion,
  setUserEquipment,
  updateProfile,
} from './profile';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

const fakeProfile: ProfileRow = {
  user_id: 'user-1',
  age: 30,
  height_cm: 175,
  weight_kg: 75,
  biological_sex: 'prefer_not_to_say',
  fitness_level: 'beginner',
  goal: 'general_fitness',
  training_days_per_week: 3,
  unit_preference: 'metric',
  training_weekdays: null,
  plan_preferences: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('getProfile (FR-1.1/FR-1.3)', () => {
  test('queries profiles filtered by user_id', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: fakeProfile, error: null });
    from.mockReturnValue(builder);

    const result = await getProfile(client, 'user-1');

    expect(from).toHaveBeenCalledWith('profiles');
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(builder.maybeSingle).toHaveBeenCalled();
    expect(result).toEqual({ data: fakeProfile, error: null });
  });

  test('returns null data (no onboarding yet) without treating it as an error', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValue(createQueryBuilderMock({ data: null, error: null }));

    const result = await getProfile(client, 'user-1');

    expect(result).toEqual({ data: null, error: null });
  });
});

describe('createProfile (FR-1.1)', () => {
  test('inserts and returns the created row', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: fakeProfile, error: null });
    from.mockReturnValue(builder);

    const result = await createProfile(client, fakeProfile);

    expect(from).toHaveBeenCalledWith('profiles');
    expect(builder.insert).toHaveBeenCalledWith(fakeProfile);
    expect(result.data).toEqual(fakeProfile);
  });
});

describe('updateProfile (FR-1.3)', () => {
  test('updates only the given user’s row', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: { ...fakeProfile, age: 31 }, error: null });
    from.mockReturnValue(builder);

    const result = await updateProfile(client, 'user-1', { age: 31 });

    expect(builder.update).toHaveBeenCalledWith({ age: 31 });
    expect(builder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect((result.data as { age: number }).age).toBe(31);
  });
});

describe('equipment helpers (FR-1.2)', () => {
  test('listEquipmentItems orders by category then name', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({ data: [], error: null });
    from.mockReturnValue(builder);

    await listEquipmentItems(client);

    expect(from).toHaveBeenCalledWith('equipment_items');
    expect(builder.order).toHaveBeenCalledWith('category');
    expect(builder.order).toHaveBeenCalledWith('display_name');
  });

  test('getUserEquipmentIds maps rows to bare ids', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValue(
      createQueryBuilderMock({
        data: [{ equipment_item_id: 'eq-1' }, { equipment_item_id: 'eq-2' }],
        error: null,
      }),
    );

    const result = await getUserEquipmentIds(client, 'user-1');

    expect(result.data).toEqual(['eq-1', 'eq-2']);
  });

  test('setUserEquipment deletes the old set then inserts the new one', async () => {
    const { client, from } = createMockClient();
    const deleteBuilder = createQueryBuilderMock({ data: null, error: null });
    const insertBuilder = createQueryBuilderMock({ data: null, error: null });
    from.mockReturnValueOnce(deleteBuilder).mockReturnValueOnce(insertBuilder);

    const result = await setUserEquipment(client, 'user-1', ['eq-1', 'eq-2']);

    expect(deleteBuilder.delete).toHaveBeenCalled();
    expect(deleteBuilder.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(insertBuilder.insert).toHaveBeenCalledWith([
      { user_id: 'user-1', equipment_item_id: 'eq-1' },
      { user_id: 'user-1', equipment_item_id: 'eq-2' },
    ]);
    expect(result.error).toBeNull();
  });

  test('setUserEquipment skips the insert call entirely for an empty list', async () => {
    const { client, from } = createMockClient();
    const deleteBuilder = createQueryBuilderMock({ data: null, error: null });
    from.mockReturnValueOnce(deleteBuilder);

    const result = await setUserEquipment(client, 'user-1', []);

    expect(from).toHaveBeenCalledTimes(1);
    expect(result.error).toBeNull();
  });

  test('setUserEquipment stops and surfaces the error if delete fails', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValueOnce(
      createQueryBuilderMock({ data: null, error: { message: 'delete failed' } }),
    );

    const result = await setUserEquipment(client, 'user-1', ['eq-1']);

    expect(result.error).toBe('delete failed');
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe('requestAccountDeletion (FR-9.3)', () => {
  test('invokes the delete-account edge function', async () => {
    const { client, functions } = createMockClient();
    functions.invoke.mockResolvedValue({ data: null, error: null });

    const result = await requestAccountDeletion(client);

    expect(functions.invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' });
    expect(result.error).toBeNull();
  });
});
