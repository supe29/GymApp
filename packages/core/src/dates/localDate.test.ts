import { localDateString, startOfLocalWeek } from './localDate';

describe('localDateString', () => {
  it('formats the local calendar date, zero-padded', () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('uses the local date late in the evening, not the UTC date', () => {
    const lateEvening = new Date(2026, 10, 11, 23, 30);
    expect(localDateString(lateEvening)).toBe('2026-11-11');
  });
});

describe('startOfLocalWeek', () => {
  it('returns Monday 00:00 for a mid-week date', () => {
    const start = startOfLocalWeek(new Date(2026, 10, 12, 15, 0)); // Thursday
    expect(start).toEqual(new Date(2026, 10, 9, 0, 0));
  });

  it('treats Monday as the first day of its own week', () => {
    expect(startOfLocalWeek(new Date(2026, 10, 9, 0, 0))).toEqual(new Date(2026, 10, 9));
  });

  it('puts Sunday in the week that started the previous Monday', () => {
    expect(startOfLocalWeek(new Date(2026, 10, 15, 22, 0))).toEqual(new Date(2026, 10, 9));
  });

  it('crosses month boundaries', () => {
    expect(startOfLocalWeek(new Date(2026, 11, 2))).toEqual(new Date(2026, 10, 30));
  });
});
