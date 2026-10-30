import { determineNextPlannedSession, type PlanSessionSummary } from './nextSessionSelector';

const SESSIONS: PlanSessionSummary[] = [
  { id: 's1', dayOrder: 1 },
  { id: 's2', dayOrder: 2 },
  { id: 's3', dayOrder: 3 },
];

describe('UX-3: determineNextPlannedSession', () => {
  it('returns null for an empty plan', () => {
    expect(determineNextPlannedSession([], new Set())).toBeNull();
  });

  it('picks the first session by day order when none are completed', () => {
    expect(determineNextPlannedSession(SESSIONS, new Set())?.id).toBe('s1');
  });

  it('picks the first incomplete session by day order', () => {
    expect(determineNextPlannedSession(SESSIONS, new Set(['s1']))?.id).toBe('s2');
  });

  it('skips over multiple completed sessions', () => {
    expect(determineNextPlannedSession(SESSIONS, new Set(['s1', 's2']))?.id).toBe('s3');
  });

  it('is unaffected by input order — always sorts by dayOrder first', () => {
    const shuffled = [SESSIONS[2], SESSIONS[0], SESSIONS[1]];
    expect(determineNextPlannedSession(shuffled, new Set(['s1']))?.id).toBe('s2');
  });

  it('cycles back to day 1 once every session has been completed', () => {
    expect(determineNextPlannedSession(SESSIONS, new Set(['s1', 's2', 's3']))?.id).toBe('s1');
  });
});
