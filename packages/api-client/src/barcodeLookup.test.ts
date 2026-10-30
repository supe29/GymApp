import { lookupFoodByBarcode } from './barcodeLookup';
import { createMockClient, createQueryBuilderMock } from './testSupport/mockClient';

describe('lookupFoodByBarcode (FR-7.1/AC-9/AC-10)', () => {
  test('returns the matching food item', async () => {
    const { client, from } = createMockClient();
    const builder = createQueryBuilderMock({
      data: {
        id: 'food-1',
        name: 'Protein Bar',
        brand: 'Acme',
        barcode: '012345678905',
        portion_description: '1 bar',
        calories_per_portion: 220,
        protein_g_per_portion: 20,
        carbs_g_per_portion: 22,
        fat_g_per_portion: 8,
        source: 'external',
        created_by_user_id: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === 'food_items') return builder;
      throw new Error(`unexpected table in test: ${table}`);
    });

    const result = await lookupFoodByBarcode(client, '012345678905');

    expect(builder.eq).toHaveBeenCalledWith('barcode', '012345678905');
    expect(result.error).toBeNull();
    expect(result.data?.name).toBe('Protein Bar');
  });

  test('AC-10: a not-found barcode is data: null, error: null — not an error', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValue(createQueryBuilderMock({ data: null, error: null }));

    const result = await lookupFoodByBarcode(client, '000000000000');

    expect(result.data).toBeNull();
    expect(result.error).toBeNull();
  });

  test('propagates a real query error distinctly from not-found', async () => {
    const { client, from } = createMockClient();
    from.mockReturnValue(createQueryBuilderMock({ data: null, error: { message: 'boom' } }));

    const result = await lookupFoodByBarcode(client, '000000000000');

    expect(result.data).toBeNull();
    expect(result.error).toBe('boom');
  });
});
