import { REST_SECONDS, formatRest, restBetweenSets } from './restRules';

describe('restBetweenSets (FR-5.4)', () => {
  test('compound lifts rest longer than isolation moves, for every goal', () => {
    for (const rest of Object.values(REST_SECONDS)) expect(rest.compound).toBeGreaterThan(rest.isolation);
  });

  test('strength rests longest and fat loss shortest', () => {
    expect(restBetweenSets('strength', 'compound').seconds).toBe(180);
    expect(restBetweenSets('muscle_gain', 'compound').seconds).toBe(120);
    expect(restBetweenSets('general_fitness', 'isolation').seconds).toBe(60);
    expect(restBetweenSets('fat_loss', 'isolation').seconds).toBe(45);
  });

  test('an unknown mechanic is treated as compound, and an unknown goal as general fitness', () => {
    expect(restBetweenSets('muscle_gain', null).seconds).toBe(120);
    expect(restBetweenSets('muscle_gain', 'something else').seconds).toBe(120);
    expect(restBetweenSets(null, 'isolation').seconds).toBe(60);
  });

  test('explains the rest in plain language', () => {
    const { reason } = restBetweenSets('strength', 'compound');
    expect(reason).toContain('several joints');
    expect(reason).toContain('For strength');
    expect(restBetweenSets('fat_loss', 'isolation').reason).toContain('one joint');
  });
});

describe('formatRest', () => {
  test('formats as m:ss, rounding part-seconds up', () => {
    expect(formatRest(90)).toBe('1:30');
    expect(formatRest(45)).toBe('0:45');
    expect(formatRest(180)).toBe('3:00');
    expect(formatRest(0.2)).toBe('0:01');
    expect(formatRest(-5)).toBe('0:00');
  });
});
