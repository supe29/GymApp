import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as apiClient from 'api-client';
import { buildSessionSummary, toAiFacts } from 'core';

import SessionSummary from './SessionSummary';

jest.mock('api-client', () => ({ getSessionInsights: jest.fn() }));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const fakeClient = {} as never;

function log(exerciseId: string, weightKg: number, reps: number, i: number) {
  return { id: `l${i}`, workoutSessionId: 'ws', exerciseId, setIndex: i, weightKg, reps, rpe: null, loggedAt: '2026-11-11T10:10:00Z' };
}

const summary = buildSessionSummary({
  sessionName: 'Full Body A',
  startedAt: '2026-11-11T10:00:00Z',
  completedAt: '2026-11-11T10:40:00Z',
  goal: 'strength',
  fitnessLevel: 'beginner',
  unitPreference: 'metric',
  exercises: [
    { exerciseId: 'ex-1', name: 'Barbell Squat', targetSets: 3, targetRepsMin: 5, targetRepsMax: 8, skipped: false, primaryMuscleKeys: ['quadriceps'], secondaryMuscleKeys: ['glutes'], mechanic: 'compound' },
    { exerciseId: 'ex-2', name: 'Bench Press', targetSets: 3, targetRepsMin: 5, targetRepsMax: 8, skipped: true, primaryMuscleKeys: ['chest'], secondaryMuscleKeys: [], mechanic: 'compound' },
  ],
  logs: [log('ex-1', 80, 5, 1), log('ex-1', 80, 5, 2), log('ex-1', 80, 5, 3)],
  priorLogs: [],
  muscleNames: { quadriceps: 'Quadriceps', glutes: 'Glutes', chest: 'Chest' },
  newPrs: [],
  progression: [],
  nextSession: { name: 'Full Body B', exercises: [{ name: 'Bench Press', primaryMuscleKeys: ['chest'], secondaryMuscleKeys: [] }] },
});
const aiFacts = toAiFacts(summary, 'metric', 'beginner');

const AI_TEXT = {
  headline: 'Strong squat day.',
  whatYouDid: 'You did 3 sets of squats at 80.0 kg.',
  bodyImpact: 'Your quadriceps did most of the work.',
  goalImpact: 'Low-rep heavy sets like these build strength.',
  nextSession: 'Full Body B trains your chest next.',
};

function renderSummary(onDone = jest.fn()) {
  return render(<SessionSummary client={fakeClient} summary={summary} aiFacts={aiFacts} unitPreference="metric" onDone={onDone} />);
}

describe('SessionSummary (FR-8.4/AI-4)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows the facts: totals, exercises, skipped ones and muscles worked', async () => {
    mockedApiClient.getSessionInsights.mockResolvedValue({ data: null, error: 'fallback' });
    const { getByTestId, getByText } = renderSummary();

    expect(getByText('3')).toBeTruthy(); // sets
    expect(getByText('1200.0 kg')).toBeTruthy(); // volume
    expect(getByText('40 min')).toBeTruthy();
    expect(getByTestId('session-summary-exercise-ex-1')).toBeTruthy();
    expect(getByText('Target met')).toBeTruthy();
    expect(getByText('Skipped: Bench Press')).toBeTruthy();
    expect(getByTestId('session-summary-muscle-quadriceps')).toBeTruthy();
    expect(getByTestId('mock-body-model')).toBeTruthy();
    await waitFor(() => expect(mockedApiClient.getSessionInsights).toHaveBeenCalledWith(fakeClient, aiFacts));
  });

  test('without AI text it shows the rule-based explanation and no AI label', async () => {
    mockedApiClient.getSessionInsights.mockResolvedValue({ data: null, error: 'ANTHROPIC_API_KEY is not set' });
    const { getByTestId, queryByTestId } = renderSummary();

    await waitFor(() => expect(queryByTestId('session-summary-ai-loading')).toBeNull());
    expect(getByTestId('session-summary-goal-text').props.children).toBe(summary.fallbackText.goalImpact);
    expect(getByTestId('session-summary-next-text').props.children).toBe(summary.fallbackText.nextSession);
    expect(queryByTestId('session-summary-ai-label')).toBeNull();
  });

  test('with AI text it shows it, labelled as AI-generated and not medical advice', async () => {
    mockedApiClient.getSessionInsights.mockResolvedValue({ data: AI_TEXT, error: null });
    const { getByTestId } = renderSummary();

    await waitFor(() => expect(getByTestId('session-summary-goal-text').props.children).toBe(AI_TEXT.goalImpact));
    expect(getByTestId('session-summary-headline').props.children).toBe(AI_TEXT.headline);
    expect(getByTestId('session-summary-next-text').props.children).toBe(AI_TEXT.nextSession);
    const label = getByTestId('session-summary-ai-label');
    expect(label).toBeTruthy();
  });

  test('a thrown AI call still falls back, and Done calls onDone', async () => {
    mockedApiClient.getSessionInsights.mockRejectedValue(new Error('offline'));
    const onDone = jest.fn();
    const { getByTestId, queryByTestId } = renderSummary(onDone);

    await waitFor(() => expect(queryByTestId('session-summary-ai-loading')).toBeNull());
    expect(getByTestId('session-summary-goal-text').props.children).toBe(summary.fallbackText.goalImpact);
    fireEvent.press(getByTestId('session-suggestions-done'));
    expect(onDone).toHaveBeenCalled();
  });
});
