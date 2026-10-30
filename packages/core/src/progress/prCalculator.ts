// Phase 10: derives personal records (PRs) purely from already-fetched set
// logs (packages/api-client is responsible for the actual Supabase query —
// see ../logs/logAggregation.ts's "read exclusively through this module"
// convention, which this module builds directly on top of for NFR-4).
//
// Resolves OQ-4: a PR is the heaviest weight ever lifted for a specific rep
// count, tracked independently per (exerciseId, repCount) bucket — not a
// single estimated-1RM number per exercise. See
// /docs/decisions/OQ-4-pr-calculation-method.md.

import type { SetLogEntry } from '../logs/logAggregation';

/** Epley formula — the simplest, most common estimated-1RM formula; supplementary context only, never the primary PR metric (OQ-4). */
export function calculateEstimatedOneRepMax(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

export interface NewPersonalRecord {
  exerciseId: string;
  repCount: number;
  weightKg: number;
  estimatedOneRm: number;
  setLogId: string;
  achievedAt: string;
}

function bucketKey(exerciseId: string, repCount: number): string {
  return `${exerciseId}::${repCount}`;
}

/**
 * FR-8.2/AC-11: compares this session's logged sets against the user's
 * prior history (every set from every OTHER session — `priorLogs` must
 * already exclude the current session) and returns one `NewPersonalRecord`
 * per `(exerciseId, repCount)` bucket where this session's best set
 * strictly exceeds the prior best for that bucket. Ties are a near-miss,
 * not a new record. Only the single heaviest set per bucket within this
 * session is considered, even if multiple sets in the session share a rep
 * count. Sets with no tracked weight (bodyweight) or zero/negative
 * reps/weight never produce a PR.
 */
export function deriveNewPersonalRecords(
  sessionLogs: SetLogEntry[],
  priorLogs: SetLogEntry[],
): NewPersonalRecord[] {
  const trackable = sessionLogs.filter(
    (log): log is SetLogEntry & { weightKg: number; reps: number } =>
      log.weightKg != null && log.weightKg > 0 && log.reps != null && log.reps > 0,
  );

  const bestInSession = new Map<string, SetLogEntry & { weightKg: number; reps: number }>();
  for (const log of trackable) {
    const key = bucketKey(log.exerciseId, log.reps);
    const current = bestInSession.get(key);
    if (!current || log.weightKg > current.weightKg) {
      bestInSession.set(key, log);
    }
  }

  const priorBestByKey = new Map<string, number>();
  for (const log of priorLogs) {
    if (log.weightKg == null || log.weightKg <= 0 || log.reps == null || log.reps <= 0) continue;
    const key = bucketKey(log.exerciseId, log.reps);
    const current = priorBestByKey.get(key) ?? 0;
    if (log.weightKg > current) {
      priorBestByKey.set(key, log.weightKg);
    }
  }

  const results: NewPersonalRecord[] = [];
  for (const log of bestInSession.values()) {
    const priorBest = priorBestByKey.get(bucketKey(log.exerciseId, log.reps)) ?? 0;
    if (log.weightKg > priorBest) {
      results.push({
        exerciseId: log.exerciseId,
        repCount: log.reps,
        weightKg: log.weightKg,
        estimatedOneRm: calculateEstimatedOneRepMax(log.weightKg, log.reps),
        setLogId: log.id,
        achievedAt: log.loggedAt,
      });
    }
  }
  return results;
}

/**
 * FR-8.2: reduces a user's full, append-only PR history down to the single
 * "current" record per `(exerciseId, repCount)` bucket (the max
 * `weightKg`) — the shape `PersonalRecordsScreen.tsx` renders. Generic so
 * it works equally on a plain `NewPersonalRecord[]` fixture in tests and on
 * api-client's richer, exercise-name-joined row shape.
 */
export function currentPersonalRecordsByBucket<
  T extends { exerciseId: string; repCount: number; weightKg: number },
>(records: T[]): Map<string, T> {
  const byBucket = new Map<string, T>();
  for (const record of records) {
    const key = bucketKey(record.exerciseId, record.repCount);
    const current = byBucket.get(key);
    if (!current || record.weightKg > current.weightKg) {
      byBucket.set(key, record);
    }
  }
  return byBucket;
}
