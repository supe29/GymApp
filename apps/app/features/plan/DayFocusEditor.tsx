import {
  FOCUS_KEYS,
  FOCUS_LABEL,
  WEEKDAY_SHORT,
  backToBackOverlaps,
  dayPlanMuscles,
  resolveDayPlans,
  type DayPlan,
  type FitnessLevel,
  type FocusKey,
  type Goal,
  type PlanPreferences,
  type PlanSplitPreference,
  type Weekday,
} from 'core';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface DayFocusEditorProps {
  weekdays: Weekday[];
  goal: Goal;
  fitnessLevel: FitnessLevel;
  /** The stored preference (null = recommended). */
  current: PlanPreferences | null;
  busy?: boolean;
  error?: string | null;
  /** Called with the chosen preference to preview the regenerated plan (nothing is saved yet). */
  onPreview: (preferences: PlanPreferences) => void;
  onCancel: () => void;
}

const SPLIT_OPTIONS: { key: PlanSplitPreference; label: string }[] = [
  { key: 'auto', label: 'Recommended' },
  { key: 'full_body', label: 'Full body' },
  { key: 'upper_lower', label: 'Upper / Lower' },
  { key: 'push_pull_legs', label: 'Push / Pull / Legs' },
  { key: 'custom', label: 'Custom' },
];

/**
 * FR-2.7: choose how training days are split — the weekday-aware
 * recommendation, a named split, or a focus (one or two) per day — and
 * which days get a "+ Core" finisher. Back-to-back days that work mostly
 * the same muscles get a warning, but the choice is the user's. Changes
 * are previewed through the regenerate diff before anything is saved.
 */
export default function DayFocusEditor({ weekdays, goal, fitnessLevel, current, busy = false, error = null, onPreview, onCancel }: DayFocusEditorProps) {
  const [split, setSplit] = useState<PlanSplitPreference>(current?.split ?? 'auto');
  const [days, setDays] = useState<DayPlan[]>(
    () => resolveDayPlans({ preferences: current, goal, fitnessLevel, weekdays }).dayPlans,
  );

  function chooseSplit(next: PlanSplitPreference) {
    setSplit(next);
    if (next !== 'custom') {
      setDays(resolveDayPlans({ preferences: { split: next }, goal, fitnessLevel, weekdays }).dayPlans);
    }
  }

  function editDay(index: number, change: (day: DayPlan) => DayPlan) {
    setSplit('custom');
    // Once the user sets a day, the week is theirs: drop the recommendation's reasons on every day.
    setDays((prev) => prev.map((day, i) => ({ ...(i === index ? change(day) : day), rationale: undefined })));
  }

  function toggleFocus(index: number, focus: FocusKey) {
    editDay(index, (day) => {
      if (day.focus.includes(focus)) {
        return day.focus.length > 1 ? { ...day, focus: day.focus.filter((f) => f !== focus) } : day;
      }
      // Up to two focuses; picking a third replaces the older one.
      return { ...day, focus: day.focus.length < 2 ? [...day.focus, focus] : [day.focus[1], focus] };
    });
  }

  const warnings = useMemo(() => new Set(backToBackOverlaps(days, weekdays, dayPlanMuscles)), [days, weekdays]);

  function handlePreview() {
    onPreview(split === 'custom' ? { split, days: days.map((d) => ({ focus: d.focus, core: d.core })) } : { split });
  }

  return (
    <View testID="plan-day-focus-editor" style={styles.card}>
      <Text style={styles.title}>How should your days be split?</Text>
      <View style={styles.chips}>
        {SPLIT_OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            testID={`plan-split-${option.key}`}
            style={[styles.chip, split === option.key && styles.chipOn]}
            onPress={() => chooseSplit(option.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: split === option.key }}
          >
            <Text style={[styles.chipText, split === option.key && styles.chipTextOn]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>

      {weekdays.map((weekday, i) => {
        const day = days[i];
        return (
          <View key={weekday} testID={`plan-focus-day-${weekday}`} style={styles.day}>
            <Text style={styles.dayName}>{WEEKDAY_SHORT[weekday]}</Text>
            <View style={styles.dayBody}>
              <View style={styles.chips}>
                {FOCUS_KEYS.map((focus) => {
                  const on = day.focus.includes(focus);
                  return (
                    <Pressable
                      key={focus}
                      testID={`plan-focus-day-${weekday}-${focus}`}
                      style={[styles.focusChip, on && styles.chipOn]}
                      onPress={() => toggleFocus(i, focus)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Text style={[styles.focusText, on && styles.chipTextOn]}>{FOCUS_LABEL[focus]}</Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  testID={`plan-focus-day-${weekday}-core`}
                  style={[styles.focusChip, styles.coreChip, day.core && styles.coreOn]}
                  onPress={() => editDay(i, (d) => ({ ...d, core: !d.core }))}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: day.core }}
                  accessibilityLabel={`Core finisher on ${WEEKDAY_SHORT[weekday]}`}
                >
                  <Text style={[styles.focusText, day.core && styles.chipTextOn]}>+ Core</Text>
                </Pressable>
              </View>
              {day.rationale ? <Text style={styles.rationale}>{day.rationale}</Text> : null}
              {warnings.has(i) ? (
                <Text testID={`plan-focus-day-${weekday}-warning`} style={styles.warning}>
                  {`Works mostly the same muscles as ${WEEKDAY_SHORT[weekdays[(i - 1 + weekdays.length) % weekdays.length]]}, the day before. Consider a different focus so they can recover.`}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}

      {error ? (
        <Text testID="plan-day-focus-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable testID="plan-day-focus-preview" style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={handlePreview} accessibilityRole="button">
          <Text style={styles.primaryText}>{busy ? 'Building preview…' : 'Preview changes'}</Text>
        </Pressable>
        <Pressable testID="plan-day-focus-cancel" onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, marginBottom: 16 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 16, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' },
  chipOn: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#111' },
  chipTextOn: { color: '#fff' },
  day: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e4e4e4', paddingVertical: 10, marginTop: 8 },
  dayName: { width: 44, fontSize: 13, fontWeight: '700', color: '#555', paddingTop: 8 },
  dayBody: { flex: 1 },
  focusChip: { borderRadius: 6, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', paddingVertical: 6, paddingHorizontal: 10, minHeight: 32, justifyContent: 'center' },
  focusText: { fontSize: 12, fontWeight: '600', color: '#111' },
  coreChip: { borderStyle: 'dashed' },
  coreOn: { backgroundColor: '#2e7d32', borderColor: '#2e7d32', borderStyle: 'solid' },
  rationale: { fontSize: 12, color: '#666', marginTop: 6 },
  warning: { fontSize: 12, color: '#b45309', marginTop: 6 },
  error: { color: '#b00020', marginTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  primary: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  primaryText: { color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  cancel: { color: '#555', fontWeight: '600' },
});
