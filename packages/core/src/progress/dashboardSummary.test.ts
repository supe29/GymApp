import { countCompletedSince, weightChange } from './dashboardSummary';

describe('countCompletedSince', () => {
  const since = new Date('2026-11-09T00:00:00Z');

  it('counts completions at or after the start, ignoring unfinished sessions', () => {
    expect(
      countCompletedSince(['2026-11-09T00:00:00Z', '2026-11-10T18:00:00Z', '2026-11-08T23:59:59Z', null], since),
    ).toBe(2);
  });

  it('returns 0 for no sessions', () => {
    expect(countCompletedSince([], since)).toBe(0);
  });
});

describe('FR-8.1: weightChange', () => {
  const now = new Date('2026-11-11T12:00:00Z');

  it('returns null with no entries', () => {
    expect(weightChange([], 7, now)).toBeNull();
  });

  it('compares the latest entry with the most recent one at least `days` old', () => {
    const result = weightChange(
      [
        { weightKg: 82, measuredAt: '2026-11-01T08:00:00Z' },
        { weightKg: 81, measuredAt: '2026-11-03T08:00:00Z' },
        { weightKg: 80.5, measuredAt: '2026-11-08T08:00:00Z' },
        { weightKg: 80, measuredAt: '2026-11-11T08:00:00Z' },
      ],
      7,
      now,
    );
    expect(result).toEqual({ latestKg: 80, deltaKg: -1 });
  });

  it('has no delta when every entry is newer than the window', () => {
    expect(weightChange([{ weightKg: 80, measuredAt: '2026-11-10T08:00:00Z' }], 7, now)).toEqual({
      latestKg: 80,
      deltaKg: null,
    });
  });

  it('has no delta when the only entry is old', () => {
    expect(weightChange([{ weightKg: 80, measuredAt: '2026-10-01T08:00:00Z' }], 7, now)).toEqual({
      latestKg: 80,
      deltaKg: null,
    });
  });

  it('does not depend on input order', () => {
    const result = weightChange(
      [
        { weightKg: 80, measuredAt: '2026-11-11T08:00:00Z' },
        { weightKg: 82, measuredAt: '2026-11-01T08:00:00Z' },
      ],
      7,
      now,
    );
    expect(result).toEqual({ latestKg: 80, deltaKg: -2 });
  });
});
