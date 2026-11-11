// UX-3: small pure summaries the dashboard shows at a glance.

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many of the given completion timestamps fall at or after `since`. Null timestamps (unfinished sessions) are ignored. */
export function countCompletedSince(completedAts: readonly (string | null)[], since: Date): number {
  const sinceMs = since.getTime();
  return completedAts.filter((at) => at !== null && Date.parse(at) >= sinceMs).length;
}

export interface WeightPoint {
  weightKg: number;
  measuredAt: string;
}

export interface WeightChange {
  latestKg: number;
  /** Latest minus the most recent entry at or before `days` ago; null when there is no entry that old. */
  deltaKg: number | null;
}

/** FR-8.1: the latest body weight and its change over the last `days` days, or null with no entries. */
export function weightChange(entries: readonly WeightPoint[], days: number, now: Date = new Date()): WeightChange | null {
  if (entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt));
  const latest = sorted[sorted.length - 1];
  const cutoffMs = now.getTime() - days * DAY_MS;

  let baseline: WeightPoint | null = null;
  for (const entry of sorted) {
    if (Date.parse(entry.measuredAt) <= cutoffMs) baseline = entry;
  }

  return {
    latestKg: latest.weightKg,
    deltaKg: baseline && baseline !== latest ? latest.weightKg - baseline.weightKg : null,
  };
}
