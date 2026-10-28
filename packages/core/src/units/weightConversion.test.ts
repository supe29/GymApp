import { formatWeight, kgToLb, lbToKg } from './weightConversion';

describe('weight conversion (UX-8)', () => {
  test('kgToLb matches the known reference conversion', () => {
    expect(kgToLb(1)).toBeCloseTo(2.20462, 4);
    expect(kgToLb(75)).toBeCloseTo(165.347, 2);
  });

  test('lbToKg matches the known reference conversion', () => {
    expect(lbToKg(1)).toBeCloseTo(0.453592, 5);
    expect(lbToKg(165)).toBeCloseTo(74.843, 2);
  });

  test('round-trips within floating-point tolerance', () => {
    const original = 82.3;
    expect(lbToKg(kgToLb(original))).toBeCloseTo(original, 6);
  });

  test('formatWeight renders metric as kg', () => {
    expect(formatWeight(75, 'metric')).toBe('75.0 kg');
  });

  test('formatWeight renders imperial as lb', () => {
    expect(formatWeight(75, 'imperial')).toBe('165.3 lb');
  });
});
