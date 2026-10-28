// Phase 6: shared height unit-conversion utility (spec.md UX-8). Pure,
// deterministic — same rationale as weightConversion.ts.

import type { UnitPreference } from './weightConversion';

const CM_PER_INCH = 2.54;

/** Converts centimeters to inches. */
export function cmToInches(cm: number): number {
  return cm / CM_PER_INCH;
}

/** Converts inches to centimeters. */
export function inchesToCm(inches: number): number {
  return inches * CM_PER_INCH;
}

/**
 * UX-8: formats a height stored in cm (the app's canonical storage unit)
 * for display, respecting the user's unit preference. Imperial is shown
 * as feet/inches (e.g. "5'11\""); metric as whole centimeters.
 */
export function formatHeight(cm: number, unitPreference: UnitPreference): string {
  if (unitPreference === 'imperial') {
    const totalInchesRounded = Math.round(cmToInches(cm));
    const feet = Math.floor(totalInchesRounded / 12);
    const remainingInches = totalInchesRounded - feet * 12;
    return `${feet}'${remainingInches}"`;
  }
  return `${Math.round(cm)} cm`;
}
