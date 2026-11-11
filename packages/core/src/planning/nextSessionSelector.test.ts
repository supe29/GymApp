import { determineNextPlannedSession, determineNextPlannedSessionAfter, type PlanSessionSummary } from './nextSessionSelector';

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

describe('UX-3: determineNextPlannedSessionAfter', () => {
  const plan = [
    { id: 's3', dayOrder: 3 },
    { id: 's1', dayOrder: 1 },
    { id: 's2', dayOrder: 2 },
  ];

  it('returns null for an empty plan', () => {
    expect(determineNextPlannedSessionAfter([], 's1')).toBeNull();
  });

  it('starts at day 1 when nothing has been completed', () => {
    expect(determineNextPlannedSessionAfter(plan, null)?.id).toBe('s1');
  });

  it('returns the session after the last completed one, by day order', () => {
    expect(determineNextPlannedSessionAfter(plan, 's1')?.id).toBe('s2');
    expect(determineNextPlannedSessionAfter(plan, 's2')?.id).toBe('s3');
  });

  it('wraps back to day 1 after the last day', () => {
    expect(determineNextPlannedSessionAfter(plan, 's3')?.id).toBe('s1');
  });

  it('starts at day 1 when the last completed session is from an older plan version', () => {
    expect(determineNextPlannedSessionAfter(plan, 'old-plan-session')?.id).toBe('s1');
  });
});
