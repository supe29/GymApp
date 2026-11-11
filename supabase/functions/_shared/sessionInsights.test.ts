import { INSIGHTS_JSON_SCHEMA, numbersIn, parseInsights, ungroundedNumbers, validateFacts, type SessionInsights } from './sessionInsights';

const FACTS = {
  session: 'Full Body A',
  totals: { sets: 6, reps: 58, volume: '1980.0 kg', volumeVsLastTime: '+580.0 kg' },
  exercises: [{ name: 'Barbell Squat', sets: 3, reps: [10, 10, 8], topWeight: '60.0 kg' }],
  goalFit: { repRange: '8-12 reps', setsInRange: 5, workingSets: 6 },
  suggestedChanges: ['Barbell Squat: increase to 62.5 kg'],
};

function insights(overrides: Partial<SessionInsights> = {}): SessionInsights {
  return {
    headline: 'Great work on Full Body A.',
    whatYouDid: 'You did 6 sets and moved 1,980 kg, +580.0 kg on last time.',
    bodyImpact: 'Your quadriceps did most of the work.',
    goalImpact: '5 of 6 sets were in your 8–12 rep range, which suits muscle gain.',
    nextSession: 'Next time, squat 62.5 kg.',
    ...overrides,
  };
}

describe('numbersIn', () => {
  test('reads decimals, thousands separators and ranges', () => {
    expect(numbersIn('moved 1,680.5 kg over 8–12 reps')).toEqual([1680.5, 8, 12]);
    expect(numbersIn('no digits here')).toEqual([]);
  });
});

describe('AI-1/AI-5: ungroundedNumbers', () => {
  test('passes when every number comes from the facts', () => {
    expect(ungroundedNumbers(insights(), FACTS)).toEqual([]);
  });

  test('flags an invented number', () => {
    expect(ungroundedNumbers(insights({ nextSession: 'Next time, add 15 kg and rest 48 hours.' }), FACTS)).toEqual([15, 48]);
  });
});

describe('parseInsights', () => {
  test('accepts the five fields', () => {
    expect(parseInsights(JSON.stringify(insights()))).toEqual(insights());
  });

  test('rejects invalid JSON, missing, empty or oversized fields', () => {
    expect(parseInsights('not json')).toBeNull();
    expect(parseInsights(JSON.stringify({ ...insights(), goalImpact: undefined }))).toBeNull();
    expect(parseInsights(JSON.stringify(insights({ headline: '  ' })))).toBeNull();
    expect(parseInsights(JSON.stringify(insights({ bodyImpact: 'x'.repeat(701) })))).toBeNull();
  });

  test('the schema requires exactly those fields', () => {
    expect([...INSIGHTS_JSON_SCHEMA.required].sort()).toEqual(['bodyImpact', 'goalImpact', 'headline', 'nextSession', 'whatYouDid']);
    expect(INSIGHTS_JSON_SCHEMA.additionalProperties).toBe(false);
  });
});

describe('validateFacts', () => {
  test('accepts a facts object', () => {
    expect(validateFacts({ facts: FACTS })).toEqual({ ok: true, facts: FACTS });
  });

  test('rejects missing, malformed and oversized facts', () => {
    expect(validateFacts(null).ok).toBe(false);
    expect(validateFacts({}).ok).toBe(false);
    expect(validateFacts({ facts: { exercises: [] } }).ok).toBe(false);
    expect(validateFacts({ facts: { ...FACTS, padding: 'x'.repeat(20_001) } }).ok).toBe(false);
  });
});
