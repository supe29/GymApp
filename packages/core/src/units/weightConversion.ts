// Phase 6: shared weight unit-conversion utility (spec.md UX-8). Pure,
// deterministic — reused by Phase 9 (food logging) and Phase 10 (weight
// trend display) per plan.md's Phase 6 file list, so screens never
// duplicate per-screen conversion math.

export type UnitPreference = 'metric' | 'imperial';

const KG_PER_LB = 0.45359237;

/** Converts kilograms to pounds. */
export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

/** Converts pounds to kilograms. */
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/**
 * UX-8: formats a weight stored in kg (the app's canonical storage unit)
 * for display, respecting the user's unit preference. Always rounds to 1
 * decimal place.
 */
export function formatWeight(kg: number, unitPreference: UnitPreference): string {
  if (unitPreference === 'imperial') {
    return `${kgToLb(kg).toFixed(1)} lb`;
  }
  return `${kg.toFixed(1)} kg`;
}
