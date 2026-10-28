import AsyncStorage from '@react-native-async-storage/async-storage';
import { logSet } from 'api-client';
import { AppState } from 'react-native';

import { createOfflineQueue, generateLocalId, type OfflineQueueHandle } from './offlineQueue';

jest.mock('api-client', () => ({
  logSet: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => Promise.resolve(store[key] ?? null)),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
        return Promise.resolve();
      }),
      __reset: () => {
        store = {};
      },
    },
  };
});

let appStateListener: ((state: string) => void) | null = null;
jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
  appStateListener = listener as (state: string) => void;
  return { remove: jest.fn() } as never;
});

const mockedLogSet = logSet as jest.MockedFunction<typeof logSet>;
const fakeClient = {} as never;

const basePayload = {
  workoutSessionId: 'session-1',
  exerciseId: 'ex-1',
  setIndex: 1,
  weightKg: 50,
  reps: 10,
  rpe: null,
};

/**
 * Drains the microtask queue repeatedly. Needed because the queue's
 * internal retry chain (loadQueue -> saveQueue -> logSet -> loadQueue ->
 * saveQueue) is several promise hops deep, and advancing fake timers only
 * fires the due callback synchronously — it does not itself wait for
 * that callback's internal awaits to settle before returning.
 */
async function flushAsync(times = 20): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}

function fakePersistedSetLog(id: string) {
  return {
    id,
    workoutSessionId: basePayload.workoutSessionId,
    exerciseId: basePayload.exerciseId,
    setIndex: basePayload.setIndex,
    weightKg: basePayload.weightKg,
    reps: basePayload.reps,
    rpe: basePayload.rpe,
    loggedAt: '2026-01-01T00:00:00Z',
  };
}

describe('generateLocalId', () => {
  test('produces well-formed, unique-looking v4-shaped ids', () => {
    const a = generateLocalId();
    const b = generateLocalId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe('offlineQueue (FR-5.1/NFR-3, resolves OQ-11)', () => {
  let queue: OfflineQueueHandle;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (AsyncStorage as unknown as { __reset: () => void }).__reset();
    appStateListener = null;
  });

  afterEach(async () => {
    await flushAsync();
    queue?.teardown();
    jest.useRealTimers();
  });

  test('enqueue persists the entry and attempts an immediate sync', async () => {
    const id = generateLocalId();
    mockedLogSet.mockResolvedValue({ data: fakePersistedSetLog(id), error: null });
    queue = createOfflineQueue(fakeClient, 'user-1');

    await queue.enqueue({ id, ...basePayload });

    expect(mockedLogSet).toHaveBeenCalledWith(fakeClient, 'user-1', { id, ...basePayload });
    const all = await queue.getAll();
    expect(all).toEqual([]); // synced immediately -> removed from the queue
  });

  test('NFR-3: a failed sync keeps the entry in the queue — it is never silently dropped', async () => {
    const id = generateLocalId();
    mockedLogSet.mockResolvedValue({ data: null, error: 'network error' });
    queue = createOfflineQueue(fakeClient, 'user-1');

    await queue.enqueue({ id, ...basePayload });

    const all = await queue.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(id);
    expect(all[0].attempts).toBe(1);
    expect(all[0].status).toBe('pending');
  });

  test('a failure schedules a backoff retry, and a subsequent success removes the entry (connectivity-resilience scenario)', async () => {
    const id = generateLocalId();
    mockedLogSet.mockResolvedValueOnce({ data: null, error: 'network error' });
    queue = createOfflineQueue(fakeClient, 'user-1');
    await queue.enqueue({ id, ...basePayload });

    expect((await queue.getAll())).toHaveLength(1);

    // Connectivity returns: the next attempt succeeds.
    mockedLogSet.mockResolvedValueOnce({ data: fakePersistedSetLog(id), error: null });
    jest.advanceTimersByTime(2000);
    await flushAsync();

    expect(await queue.getAll()).toEqual([]);
    expect(mockedLogSet).toHaveBeenCalledTimes(2);
  });

  test('after 5 consecutive failures the entry is labeled failed but remains queued and keeps retrying', async () => {
    const id = generateLocalId();
    mockedLogSet.mockResolvedValue({ data: null, error: 'network error' });
    queue = createOfflineQueue(fakeClient, 'user-1');
    await queue.enqueue({ id, ...basePayload }); // attempts=1, next retry scheduled at +2s

    // Cumulative backoff to reach attempts=5: 2s+4s+8s+16s = 30s. Step
    // through one retry at a time so each one's internal awaits settle
    // (and the NEXT setTimeout gets registered) before advancing again.
    for (let i = 0; i < 4; i += 1) {
      jest.advanceTimersByTime(60000);
      await flushAsync();
    }

    const all = await queue.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].attempts).toBe(5);
    expect(all[0].status).toBe('failed');
  });

  test('an AppState foreground event triggers an immediate flush', async () => {
    const id = generateLocalId();
    mockedLogSet.mockResolvedValueOnce({ data: null, error: 'network error' });
    queue = createOfflineQueue(fakeClient, 'user-1');
    await queue.enqueue({ id, ...basePayload });
    expect(mockedLogSet).toHaveBeenCalledTimes(1);

    mockedLogSet.mockResolvedValueOnce({ data: fakePersistedSetLog(id), error: null });
    appStateListener?.('active');
    await flushAsync();

    expect(await queue.getAll()).toEqual([]);
  });

  test('discard removes the entry and cancels its scheduled retry', async () => {
    const id = generateLocalId();
    mockedLogSet.mockResolvedValue({ data: null, error: 'network error' });
    queue = createOfflineQueue(fakeClient, 'user-1');
    await queue.enqueue({ id, ...basePayload });
    expect(await queue.getAll()).toHaveLength(1);

    await queue.discard(id);

    expect(await queue.getAll()).toEqual([]);
    mockedLogSet.mockClear();
    jest.advanceTimersByTime(120000);
    await flushAsync();
    expect(mockedLogSet).not.toHaveBeenCalled();
  });

  test('retryNow attempts an immediate sync for a specific entry', async () => {
    const id = generateLocalId();
    mockedLogSet.mockResolvedValueOnce({ data: null, error: 'network error' });
    queue = createOfflineQueue(fakeClient, 'user-1');
    await queue.enqueue({ id, ...basePayload });

    mockedLogSet.mockResolvedValueOnce({ data: fakePersistedSetLog(id), error: null });
    await queue.retryNow(id);

    expect(await queue.getAll()).toEqual([]);
  });
});
