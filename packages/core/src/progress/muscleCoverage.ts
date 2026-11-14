// FR-8.5: a day's muscle coverage — how much of the work planned for each
// muscle that day has been done, and what is left. Deterministic and pure
// (AI-1): every percent and set count shown on the Body progress screen
// comes from here. Uses the same weighting as the session summary
// (FR-8.4): a set counts 1 for each primary muscle and 0.5 for each
// secondary muscle.

export interface MuscleSetsInput {
  /** Sets planned (targetSets) or sets logged for this exercise. */
  sets: number;
  primaryMuscleKeys: readonly string[];
  secondaryMuscleKeys: readonly string[];
}

export const SECONDARY_MUSCLE_WEIGHT = 0.5;

/** Weighted sets per muscle key: primary = 1 per set, secondary = 0.5 per set. */
export function weightedSetsByMuscle(exercises: readonly MuscleSetsInput[]): Map<string, number> {
  const weighted = new Map<string, number>();
  for (const ex of exercises) {
    if (ex.sets <= 0) continue;
    ex.primaryMuscleKeys.forEach((key) => weighted.set(key, (weighted.get(key) ?? 0) + ex.sets));
    ex.secondaryMuscleKeys.forEach((key) =>
      weighted.set(key, (weighted.get(key) ?? 0) + ex.sets * SECONDARY_MUSCLE_WEIGHT),
    );
  }
  return weighted;
}

export interface MuscleCoverage {
  key: string;
  name: string;
  plannedSets: number;
  doneSets: number;
  remainingSets: number;
  /** 0–100, capped; null when nothing was planned for this muscle. */
  percent: number | null;
  /** Worked today but not part of the day's plan. */
  extra: boolean;
}

export interface DayMuscleCoverage {
  /** Share of the day's planned weighted sets done (0–100); null when nothing was planned. */
  overallPercent: number | null;
  plannedTotal: number;
  doneTowardPlan: number;
  muscles: MuscleCoverage[];
  /**
   * 0–1 per muscle key, for the 3D heatmap: the muscle's percent when it
   * was planned; otherwise its done sets relative to the day's most-worked
   * muscle. Muscles with nothing planned and nothing done are omitted.
   */
  regionIntensity: Record<string, number>;
}

export interface DayMuscleCoverageInput {
  /** Every exercise planned for the day, with its targetSets as `sets`. */
  planned: readonly MuscleSetsInput[];
  /** Every exercise logged that day, with its logged set count as `sets`. */
  done: readonly MuscleSetsInput[];
  /** muscle_groups.key -> display name. */
  muscleNames: Readonly<Record<string, string>>;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function buildDayMuscleCoverage(input: DayMuscleCoverageInput): DayMuscleCoverage {
  const planned = weightedSetsByMuscle(input.planned);
  const done = weightedSetsByMuscle(input.done);
  const keys = [...new Set([...planned.keys(), ...done.keys()])];

  const muscles: MuscleCoverage[] = keys.map((key) => {
    const plannedSets = planned.get(key) ?? 0;
    const doneSets = done.get(key) ?? 0;
    return {
      key,
      name: input.muscleNames[key] ?? key,
      plannedSets: round1(plannedSets),
      doneSets: round1(doneSets),
      remainingSets: round1(Math.max(0, plannedSets - doneSets)),
      percent: plannedSets > 0 ? Math.min(100, Math.round((doneSets / plannedSets) * 100)) : null,
      extra: plannedSets === 0,
    };
  });

  // Unfinished planned muscles first (least done first), then finished ones, then extras.
  const rank = (m: MuscleCoverage) => (m.extra ? 2 : (m.percent ?? 0) >= 100 ? 1 : 0);
  muscles.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.percent ?? 0) - (b.percent ?? 0) ||
      b.plannedSets - a.plannedSets ||
      b.doneSets - a.doneSets ||
      a.name.localeCompare(b.name),
  );

  let plannedTotal = 0;
  let doneTowardPlan = 0;
  for (const [key, p] of planned) {
    plannedTotal += p;
    doneTowardPlan += Math.min(p, done.get(key) ?? 0);
  }

  const maxDone = Math.max(0, ...done.values());
  const regionIntensity: Record<string, number> = {};
  for (const m of muscles) {
    const value =
      m.percent !== null ? m.percent / 100 : maxDone > 0 ? (done.get(m.key) ?? 0) / maxDone : 0;
    if (value > 0) regionIntensity[m.key] = Math.min(1, value);
  }

  return {
    overallPercent: plannedTotal > 0 ? Math.round((doneTowardPlan / plannedTotal) * 100) : null,
    plannedTotal: round1(plannedTotal),
    doneTowardPlan: round1(doneTowardPlan),
    muscles,
    regionIntensity,
  };
}
