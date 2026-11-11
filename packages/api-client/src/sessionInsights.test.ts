import { getSessionInsights } from './sessionInsights';
import { createMockClient } from './testSupport/mockClient';

const facts = { session: 'Full Body A', exercises: [] } as never;
const insights = { headline: 'h', whatYouDid: 'w', bodyImpact: 'b', goalImpact: 'g', nextSession: 'n' };

describe('getSessionInsights (FR-8.4/AI-5)', () => {
  test('posts the facts to the session-insights function and returns its text', async () => {
    const { client, functions } = createMockClient();
    functions.invoke.mockResolvedValue({ data: { insights, model: 'claude-opus-5-5' }, error: null });

    const result = await getSessionInsights(client, facts);

    expect(functions.invoke).toHaveBeenCalledWith('session-insights', { method: 'POST', body: { facts } });
    expect(result).toEqual({ data: insights, error: null });
  });

  test('a fallback answer becomes an error carrying the reason', async () => {
    const { client, functions } = createMockClient();
    functions.invoke.mockResolvedValue({ data: { fallback: true, reason: 'ANTHROPIC_API_KEY is not set' }, error: null });

    expect(await getSessionInsights(client, facts)).toEqual({ data: null, error: 'ANTHROPIC_API_KEY is not set' });
  });

  test('invoke errors, thrown errors and malformed replies all become errors', async () => {
    const { client, functions } = createMockClient();
    functions.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Function not found' } });
    expect((await getSessionInsights(client, facts)).error).toBe('Function not found');

    functions.invoke.mockRejectedValueOnce(new Error('offline'));
    expect((await getSessionInsights(client, facts)).error).toBe('offline');

    functions.invoke.mockResolvedValueOnce({ data: { insights: { headline: 'only one field' } }, error: null });
    expect((await getSessionInsights(client, facts)).data).toBeNull();
  });
});
