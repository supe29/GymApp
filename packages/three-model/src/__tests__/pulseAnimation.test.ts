import {
  PRIMARY_PEAK_OPACITY,
  PULSE_PERIOD_SECONDS,
  pulseOpacity,
  regionPulsePeakOpacity,
  SECONDARY_PEAK_OPACITY,
} from '../pulseAnimation';

describe('pulseOpacity (shared by web and native — drives the per-exercise region pulse)', () => {
  test('a quarter-period in, the pulse is at its peak', () => {
    expect(pulseOpacity(PULSE_PERIOD_SECONDS / 4, 0.4)).toBeCloseTo(0.4);
  });

  test('three-quarters-period in, the pulse is at its trough (0)', () => {
    expect(pulseOpacity((3 * PULSE_PERIOD_SECONDS) / 4, 0.4)).toBeCloseTo(0);
  });

  test('at t=0 and at a half period, the pulse sits at the midpoint', () => {
    expect(pulseOpacity(0, 0.4)).toBeCloseTo(0.2);
    expect(pulseOpacity(PULSE_PERIOD_SECONDS / 2, 0.4)).toBeCloseTo(0.2);
  });

  test('a full period returns to the same value it started at', () => {
    expect(pulseOpacity(PULSE_PERIOD_SECONDS, 0.4)).toBeCloseTo(pulseOpacity(0, 0.4));
  });

  test('peakOpacity of 0 always yields 0, regardless of elapsed time', () => {
    expect(pulseOpacity(0, 0)).toBe(0);
    expect(pulseOpacity(PULSE_PERIOD_SECONDS / 4, 0)).toBe(0);
    expect(pulseOpacity(123.456, 0)).toBe(0);
  });

  test('output never exceeds [0, peakOpacity] across a dense sweep of elapsed times', () => {
    const peak = 0.45;
    for (let t = 0; t <= 10; t += 0.01) {
      const value = pulseOpacity(t, peak);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(peak);
    }
  });

  test('is deterministic: the same inputs always produce the same output', () => {
    expect(pulseOpacity(2.718, 0.3)).toBe(pulseOpacity(2.718, 0.3));
  });
});

describe('regionPulsePeakOpacity', () => {
  const activeExerciseMuscles = { primary: ['chest'], secondary: ['shoulders', 'triceps'] };

  test('a primary-muscle region gets PRIMARY_PEAK_OPACITY', () => {
    expect(regionPulsePeakOpacity('chest', activeExerciseMuscles)).toBe(PRIMARY_PEAK_OPACITY);
  });

  test('a secondary-muscle region gets the dimmer SECONDARY_PEAK_OPACITY', () => {
    expect(regionPulsePeakOpacity('shoulders', activeExerciseMuscles)).toBe(SECONDARY_PEAK_OPACITY);
    expect(regionPulsePeakOpacity('triceps', activeExerciseMuscles)).toBe(SECONDARY_PEAK_OPACITY);
  });

  test('primary is strictly brighter than secondary', () => {
    expect(PRIMARY_PEAK_OPACITY).toBeGreaterThan(SECONDARY_PEAK_OPACITY);
  });

  test('an untargeted region gets 0', () => {
    expect(regionPulsePeakOpacity('calves', activeExerciseMuscles)).toBe(0);
  });

  test('no active exercise (null or undefined) means 0 for every region', () => {
    expect(regionPulsePeakOpacity('chest', null)).toBe(0);
    expect(regionPulsePeakOpacity('chest', undefined)).toBe(0);
  });
});
