import { WEEKDAY_SHORT, type MissedOption, type ScheduleEntry, type Weekday } from 'core';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface MissedSessionCardProps {
  missed: ScheduleEntry;
  options: MissedOption[];
  /** Full card: every option as a button. Compact (dashboard): the recommendation and a link. */
  variant?: 'full' | 'compact';
  busy?: boolean;
  onChoose?: (option: MissedOption) => void;
  onSeeOptions?: () => void;
}

function weekdayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = (((new Date(y, m - 1, d).getDay() + 6) % 7) + 1) as Weekday;
  return `${WEEKDAY_SHORT[weekday]} ${d}`;
}

/**
 * FR-2.6: a missed planned session, the recommended fix (the first,
 * best-ranked option from core's suggestMissedSessionOptions) and why,
 * and the alternatives. The user always chooses; nothing moves on its own.
 */
export default function MissedSessionCard({
  missed,
  options,
  variant = 'full',
  busy = false,
  onChoose,
  onSeeOptions,
}: MissedSessionCardProps) {
  const testID = `missed-session-${missed.session.id}`;
  const [recommended, ...others] = options;

  return (
    <View testID={testID} style={styles.card} accessibilityRole="alert">
      <Text style={styles.kicker}>{`Missed · ${weekdayLabel(missed.date)}`}</Text>
      <Text style={styles.title}>{missed.session.name}</Text>
      {recommended ? (
        <>
          <Text testID={`${testID}-recommendation`} style={styles.recommendation}>
            {`Suggested: ${recommended.label}`}
          </Text>
          <Text testID={`${testID}-reason`} style={styles.reason}>
            {recommended.reason}
          </Text>
        </>
      ) : null}

      {variant === 'full' ? (
        <View style={styles.buttons}>
          {options.map((option, index) => (
            <Pressable
              key={`${option.kind}-${index}`}
              testID={`${testID}-option-${option.kind}`}
              style={[styles.button, index === 0 ? styles.primary : styles.secondary, busy && styles.disabled]}
              disabled={busy}
              onPress={() => onChoose?.(option)}
              accessibilityRole="button"
              accessibilityHint={option.reason}
            >
              <Text style={[styles.buttonText, index !== 0 && styles.secondaryText]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Pressable testID={`${testID}-see-options`} onPress={onSeeOptions} accessibilityRole="button">
          <Text style={styles.link}>{others.length > 0 ? `See all ${options.length} options` : 'See options'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fdf3e6', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#f3d2a8' },
  kicker: { fontSize: 12, fontWeight: '700', color: '#b45309', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  recommendation: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  reason: { fontSize: 13, color: '#444', marginTop: 2, lineHeight: 18 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  button: { borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  primary: { backgroundColor: '#111' },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ccc' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  secondaryText: { color: '#111' },
  link: { fontSize: 13, fontWeight: '700', color: '#b45309', marginTop: 8 },
});
