// Phase 7: resolves OQ-11 (spec.md NFR-3 — connectivity resilience during
// workout logging). See /docs/decisions/OQ-11-connectivity-retry-policy.md
// for the full rationale behind the choices made here:
//
//   - No connectivity-detection library (no NetInfo). Retries run on a
//     timed exponential backoff (2s -> 60s cap) regardless of actual
//     connectivity state, plus an immediate flush whenever the app
//     returns to the foreground (AppState) as a "maybe reconnected" nudge.
//   - A queued set is NEVER auto-discarded. After 5 consecutive failures
//     it is labeled 'failed' in the UI ("Couldn't sync") but background
//     retries keep running at the capped interval; only an explicit
//     discard() call removes it.
//   - Each entry carries a client-generated id, used as the set_logs
//     upsert idempotency key (see packages/api-client/src/workoutSessions.ts's
//     logSet), so a retry after an ambiguous prior attempt is always safe.
//
// The queue itself is persisted to AsyncStorage so entered sets survive
// an app restart during a drop, not just a brief in-memory gap.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logSet, type GymSupabaseClient, type SetLogInput } from 'api-client';
import { AppState, type AppStateStatus } from 'react-native';

const STORAGE_KEY = '@gym/offline-set-log-queue';
const INITIAL_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 60000;
/** After this many consecutive failures, label the entry 'failed' in the UI — retries still continue. */
const FAILURE_LABEL_THRESHOLD = 5;

export type QueuedSetLogStatus = 'pending' | 'syncing' | 'failed';

export interface QueuedSetLog {
  id: string;
  payload: Omit<SetLogInput, 'id'>;
  attempts: number;
  status: QueuedSetLogStatus;
  nextRetryAt: number;
}

export interface OfflineQueueCallbacks {
  onSynced?: (id: string) => void;
  onFailed?: (id: string, attempts: number) => void;
}

export interface OfflineQueueHandle {
  /**
   * Persists the entry and attempts an immediate sync. The caller
   * supplies `input.id` (via `generateLocalId()`) rather than the queue
   * generating one internally, so the caller can build its optimistic UI
   * entry with the real id up front — no placeholder-id rename, no race
   * between that rename and the onSynced/onFailed callbacks firing.
   */
  enqueue(input: SetLogInput): Promise<void>;
  retryNow(id: string): Promise<void>;
  discard(id: string): Promise<void>;
  getAll(): Promise<QueuedSetLog[]>;
  /** Removes the AppState listener and cancels pending backoff timers — call on unmount. */
  teardown(): void;
}

/**
 * A compact, non-cryptographic UUID v4. Used only as a sync idempotency
 * key (NFR-3) — never a security context — so Math.random is sufficient
 * and avoids the crypto.getRandomValues polyfill the `uuid` package would
 * otherwise need on React Native.
 */
export function generateLocalId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function loadQueue(): Promise<QueuedSetLog[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as QueuedSetLog[];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedSetLog[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

function backoffDelay(attempts: number): number {
  return Math.min(INITIAL_RETRY_DELAY_MS * 2 ** (attempts - 1), MAX_RETRY_DELAY_MS);
}

/** FR-5.1/NFR-3: creates a per-session offline queue backed by AsyncStorage. */
export function createOfflineQueue(
  client: GymSupabaseClient,
  userId: string,
  callbacks: OfflineQueueCallbacks = {},
): OfflineQueueHandle {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearScheduledRetry(id: string) {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }

  async function attemptSync(entry: QueuedSetLog): Promise<void> {
    clearScheduledRetry(entry.id);

    let queue = await loadQueue();
    queue = queue.map((e) => (e.id === entry.id ? { ...e, status: 'syncing' as const } : e));
    await saveQueue(queue);

    const syncResult = await logSet(client, userId, { id: entry.id, ...entry.payload });

    queue = await loadQueue();
    const current = queue.find((e) => e.id === entry.id);
    if (!current) {
      // Discarded (or already synced by a concurrent call) while this attempt was in flight.
      return;
    }

    if (!syncResult.error) {
      await saveQueue(queue.filter((e) => e.id !== entry.id));
      callbacks.onSynced?.(entry.id);
      return;
    }

    const attempts = current.attempts + 1;
    const delay = backoffDelay(attempts);
    const status: QueuedSetLogStatus = attempts >= FAILURE_LABEL_THRESHOLD ? 'failed' : 'pending';
    const nextRetryAt = Date.now() + delay;
    await saveQueue(
      queue.map((e) => (e.id === entry.id ? { ...e, attempts, status, nextRetryAt } : e)),
    );
    callbacks.onFailed?.(entry.id, attempts);

    const timer = setTimeout(() => {
      scheduleSync(entry.id);
    }, delay);
    timers.set(entry.id, timer);
  }

  async function scheduleSync(id: string): Promise<void> {
    const queue = await loadQueue();
    const entry = queue.find((e) => e.id === id);
    if (entry) {
      await attemptSync(entry);
    }
  }

  /**
   * Attempts every non-syncing queued entry right now, ignoring
   * `nextRetryAt` — this is the "app returned to the foreground, maybe
   * we're back online" nudge (decision #1), so it deliberately does not
   * wait for the backoff schedule to catch up.
   */
  async function flush(): Promise<void> {
    const queue = await loadQueue();
    for (const entry of queue) {
      if (entry.status !== 'syncing') {
        clearScheduledRetry(entry.id);
        await attemptSync(entry);
      }
    }
  }

  function handleAppStateChange(state: AppStateStatus): void {
    if (state === 'active') {
      flush();
    }
  }
  const subscription = AppState.addEventListener('change', handleAppStateChange);

  return {
    async enqueue(input) {
      const { id, ...payload } = input;
      const entry: QueuedSetLog = { id, payload, attempts: 0, status: 'pending', nextRetryAt: Date.now() };
      const queue = await loadQueue();
      queue.push(entry);
      await saveQueue(queue);
      await attemptSync(entry);
    },
    async retryNow(id) {
      await scheduleSync(id);
    },
    async discard(id) {
      clearScheduledRetry(id);
      const queue = await loadQueue();
      await saveQueue(queue.filter((e) => e.id !== id));
    },
    async getAll() {
      return loadQueue();
    },
    teardown() {
      subscription.remove();
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    },
  };
}
