import {
  WEEKDAY_SHORT,
  type EntryStatus,
  type MonthDay,
  type MonthSchedule,
  type Weekday,
} from 'core';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface MonthCalendarProps {
  schedule: MonthSchedule;
  /** Today, YYYY-MM-DD (local). */
  today: string;
  /** Whether this is the month containing today (hides the "This month" link). */
  isCurrent: boolean;
  onPrev: () => void;
  onNext: () => void;
  onThisMonth: () => void;
  /** Opens the week containing this date (YYYY-MM-DD). */
  onSelectDay: (date: string) => void;
}

const MARK: Record<EntryStatus, string> = {
  done: '●',
  today: '○',
  upcoming: '○',
  missed: '✕',
  skipped: '–',
  merged: '',
};

const STATUS_WORD: Record<EntryStatus, string> = {
  done: 'done',
  today: 'today',
  upcoming: 'upcoming',
  missed: 'missed',
  skipped: 'skipped',
  merged: 'merged',
};

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { js: new Date(y, m - 1, d), day: d };
}

function cellLabel(day: MonthDay, today: string): string {
  const { js } = parts(day.date);
  const when = js.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const what =
    day.entries.length > 0
      ? day.entries.map((e) => `${e.session.name}, ${STATUS_WORD[e.status]}`).join('; ')
      : day.loggedWorkout
        ? 'workout logged'
        : 'rest day';
  return `${when}${day.date === today ? ' (today)' : ''}, ${what}`;
}

/**
 * FR-2.8/AC-21: the plan as a month calendar, Monday first. Each training
 * day shows its focus and status; tapping a day opens its week.
 */
export default function MonthCalendar({
  schedule,
  today,
  isCurrent,
  onPrev,
  onNext,
  onThisMonth,
  onSelectDay,
}: MonthCalendarProps) {
  const title = new Date(schedule.year, schedule.month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const rows = Array.from({ length: schedule.days.length / 7 }, (_, i) =>
    schedule.days.slice(i * 7, i * 7 + 7),
  );

  return (
    <View testID="plan-month">
      <View style={styles.header}>
        <Text testID="plan-month-title" style={styles.title}>
          {title}
        </Text>
        <View style={styles.nav}>
          {!isCurrent ? (
            <Pressable testID="plan-month-current" onPress={onThisMonth} accessibilityRole="button">
              <Text style={styles.link}>This month</Text>
            </Pressable>
          ) : null}
          <Pressable
            testID="plan-month-prev"
            onPress={onPrev}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={styles.arrow}
          >
            <Text style={styles.arrowText}>‹</Text>
          </Pressable>
          <Pressable
            testID="plan-month-next"
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            style={styles.arrow}
          >
            <Text style={styles.arrowText}>›</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.row}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {WEEKDAY_SHORT[w].slice(0, 2)}
          </Text>
        ))}
      </View>

      {rows.map((row) => (
        <View key={row[0].date} style={styles.row}>
          {row.map((day) => {
            const isToday = day.date === today;
            const entry = day.entries[0];
            return (
              <Pressable
                key={day.date}
                testID={`plan-month-day-${day.date}`}
                onPress={() => onSelectDay(day.date)}
                accessibilityRole="button"
                accessibilityLabel={cellLabel(day, today)}
                style={[
                  styles.cell,
                  isToday && styles.cellToday,
                  !day.inMonth && styles.cellOutside,
                ]}
              >
                <Text style={[styles.dayNumber, isToday && styles.todayText]}>
                  {parts(day.date).day}
                </Text>
                {entry ? (
                  <>
                    <Text
                      testID={`plan-month-day-${day.date}-mark`}
                      style={[styles.mark, styles[`mark_${entry.status}`]]}
                    >
                      {MARK[entry.status]}
                    </Text>
                    <Text
                      testID={`plan-month-day-${day.date}-focus`}
                      numberOfLines={2}
                      style={[styles.focus, entry.status === 'skipped' && styles.struck]}
                    >
                      {day.entries.map((e) => e.session.name).join(' / ')}
                    </Text>
                  </>
                ) : day.loggedWorkout ? (
                  <Text
                    testID={`plan-month-day-${day.date}-mark`}
                    style={[styles.mark, styles.mark_done]}
                  >
                    ●
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      <View
        style={styles.legend}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={[styles.legendItem, styles.mark_done]}>● done</Text>
        <Text style={[styles.legendItem, styles.mark_upcoming]}>○ planned</Text>
        <Text style={[styles.legendItem, styles.mark_missed]}>✕ missed</Text>
        <Text style={[styles.legendItem, styles.mark_skipped]}>– skipped</Text>
      </View>
      <Text style={styles.hint}>Tap a day to see its week.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '700' },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  link: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111',
    textDecorationLine: 'underline',
    marginRight: 8,
  },
  arrow: { paddingHorizontal: 10, paddingVertical: 2 },
  arrowText: { fontSize: 22, fontWeight: '700', color: '#111' },
  row: { flexDirection: 'row' },
  weekday: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    paddingBottom: 4,
  },
  cell: {
    width: '14.28%',
    minHeight: 64,
    paddingVertical: 4,
    paddingHorizontal: 2,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e6e6e6',
  },
  cellToday: { backgroundColor: '#f3f7f3', borderRadius: 8, borderTopColor: 'transparent' },
  cellOutside: { opacity: 0.4 },
  dayNumber: { fontSize: 13, fontWeight: '700', color: '#111' },
  todayText: { color: '#2e7d32' },
  mark: { fontSize: 12, lineHeight: 16 },
  mark_done: { color: '#2e7d32' },
  mark_today: { color: '#111' },
  mark_upcoming: { color: '#555' },
  mark_missed: { color: '#b00020' },
  mark_skipped: { color: '#999' },
  mark_merged: { color: '#999' },
  focus: { fontSize: 10, color: '#333', textAlign: 'center' },
  struck: { textDecorationLine: 'line-through', color: '#999' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  legendItem: { fontSize: 12 },
  hint: { fontSize: 12, color: '#666', marginTop: 4 },
});
