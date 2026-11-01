import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export interface NumberStepperProps {
  /** Current value; null renders as an empty field showing `placeholder`. */
  value: number | null;
  onChange: (value: number | null) => void;
  step: number;
  min?: number;
  max?: number;
  /**
   * When true, stepping below `min` or clearing the field yields null
   * (e.g. optional RPE); otherwise the value clamps to `min`.
   */
  clearable?: boolean;
  /** Lowercase noun used in accessibility labels ("weight" → "Decrease weight"). */
  label: string;
  /** Unit shown after the value, e.g. "kg". */
  unit?: string;
  placeholder?: string;
  /** Prefix for `${testID}-dec`, `${testID}-value`, `${testID}-inc`. */
  testID: string;
}

function roundToStepPrecision(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseNumber(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
}

/**
 * UX-4: large +/- buttons for one-handed gym use, with the value itself
 * an editable numeric field so a big jump (70 → 100 kg) is one edit
 * rather than dozens of taps.
 */
export default function NumberStepper({
  value,
  onChange,
  step,
  min = 0,
  max,
  clearable = false,
  label,
  unit,
  placeholder = '0',
  testID,
}: NumberStepperProps) {
  // Raw text while the field is being edited, so intermediate input like
  // "82." isn't reformatted mid-keystroke; null when not editing.
  const [draft, setDraft] = useState<string | null>(null);

  function clamp(n: number): number | null {
    if (n < min) return clearable ? null : min;
    return roundToStepPrecision(max != null ? Math.min(max, n) : n);
  }

  function stepBy(delta: number) {
    setDraft(null);
    onChange(clamp((value ?? (delta > 0 ? 0 : min)) + delta));
  }

  function handleChangeText(text: string) {
    setDraft(text);
    if (text.trim() === '') {
      onChange(clearable ? null : min);
      return;
    }
    const parsed = parseNumber(text);
    if (parsed != null) onChange(clamp(parsed));
  }

  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <View style={styles.controls}>
      <Pressable
        testID={`${testID}-dec`}
        style={styles.button}
        onPress={() => stepBy(-step)}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
      >
        <Text style={styles.buttonText}>-</Text>
      </Pressable>
      <View style={styles.valueBox}>
        <TextInput
          testID={`${testID}-value`}
          style={styles.input}
          value={draft ?? (value == null ? '' : String(value))}
          placeholder={placeholder}
          onChangeText={handleChangeText}
          onBlur={() => setDraft(null)}
          keyboardType="decimal-pad"
          inputMode="decimal"
          selectTextOnFocus
          accessibilityLabel={capitalized}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      <Pressable
        testID={`${testID}-inc`}
        style={styles.button}
        onPress={() => stepBy(step)}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
      >
        <Text style={styles.buttonText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: {
    backgroundColor: '#111',
    borderRadius: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  valueBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    fontSize: 18,
    fontWeight: '600',
    width: 64,
    height: 44,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  unit: { fontSize: 14, color: '#444' },
});
