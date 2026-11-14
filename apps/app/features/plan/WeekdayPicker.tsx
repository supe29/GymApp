import { WEEKDAY_SHORT, type Weekday } from 'core';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const ALL_DAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export interface WeekdayPickerProps {
  /** How many days must be picked (the profile's training days per week). */
  count: number;
  initial: Weekday[];
  saving?: boolean;
  error?: string | null;
  onSave: (weekdays: Weekday[]) => void;
  onCancel?: () => void;
}

/** FR-2.5: pick exactly `count` weekdays to train on. */
export default function WeekdayPicker({ count, initial, saving = false, error = null, onSave, onCancel }: WeekdayPickerProps) {
  const [picked, setPicked] = useState<Set<Weekday>>(new Set(initial));
  const remaining = count - picked.size;

  function toggle(day: Weekday) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else if (next.size < count) next.add(day);
      return next;
    });
  }

  return (
    <View testID="plan-weekday-picker" style={styles.card}>
      <Text style={styles.title}>Which days do you train?</Text>
      <Text style={styles.help}>
        {`Your plan has ${count} ${count === 1 ? 'session' : 'sessions'} a week. Pick ${count}, ideally with rest days in between.`}
      </Text>
      <View style={styles.days}>
        {ALL_DAYS.map((day) => {
          const selected = picked.has(day);
          return (
            <Pressable
              key={day}
              testID={`plan-weekday-${day}`}
              style={[styles.day, selected && styles.daySelected]}
              onPress={() => toggle(day)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={WEEKDAY_SHORT[day]}
            >
              <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{WEEKDAY_SHORT[day]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.help}>
        {remaining > 0 ? `Pick ${remaining} more.` : remaining === 0 ? 'Looks good.' : ''}
      </Text>
      {error ? (
        <Text testID="plan-weekday-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          testID="plan-weekday-save"
          style={[styles.save, (remaining !== 0 || saving) && styles.disabled]}
          disabled={remaining !== 0 || saving}
          onPress={() => onSave([...picked].sort((a, b) => a - b))}
          accessibilityRole="button"
        >
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save days'}</Text>
        </Pressable>
        {onCancel ? (
          <Pressable testID="plan-weekday-cancel" onPress={onCancel} accessibilityRole="button">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 14, marginBottom: 16 },
  title: { fontSize: 16, fontWeight: '700' },
  help: { fontSize: 13, color: '#555', marginTop: 4 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  day: { minWidth: 44, minHeight: 44, borderRadius: 8, borderWidth: 1, borderColor: '#ccc', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  daySelected: { backgroundColor: '#111', borderColor: '#111' },
  dayText: { fontWeight: '600', color: '#111' },
  dayTextSelected: { color: '#fff' },
  error: { color: '#b00020', marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  save: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16 },
  disabled: { opacity: 0.4 },
  saveText: { color: '#fff', fontWeight: '600' },
  cancel: { color: '#555', fontWeight: '600' },
});
