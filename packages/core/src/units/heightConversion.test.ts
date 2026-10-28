import { cmToInches, formatHeight, inchesToCm } from './heightConversion';

describe('height conversion (UX-8)', () => {
  test('cmToInches matches the known reference conversion', () => {
    expect(cmToInches(2.54)).toBeCloseTo(1, 6);
    expect(cmToInches(180)).toBeCloseTo(70.866, 2);
  });

  test('inchesToCm matches the known reference conversion', () => {
    expect(inchesToCm(1)).toBeCloseTo(2.54, 6);
    expect(inchesToCm(71)).toBeCloseTo(180.34, 1);
  });

  test('round-trips within floating-point tolerance', () => {
    const original = 175.3;
    expect(inchesToCm(cmToInches(original))).toBeCloseTo(original, 6);
  });

  test('formatHeight renders metric as whole centimeters', () => {
    expect(formatHeight(175.3, 'metric')).toBe('175 cm');
  });

  test('formatHeight renders imperial as feet and inches', () => {
    // 180cm ≈ 70.87in -> 5 feet, 10.87in -> rounds to 5'11"
    expect(formatHeight(180, 'imperial')).toBe("5'11\"");
  });

  test('formatHeight handles an exact whole-foot boundary without an inches overflow', () => {
    // 6 feet = 72in = 182.88cm
    expect(formatHeight(182.88, 'imperial')).toBe("6'0\"");
  });

  test('formatHeight never renders 12 inches by rounding up into the next foot instead', () => {
    // 71.6in rounds to 72in -> must carry to 6'0", not display as 5'12"
    expect(formatHeight(inchesToCm(71.6), 'imperial')).toBe("6'0\"");
  });
});
