import { searchExercises, type ExerciseWithTags } from 'core';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export interface ExercisePickerProps {
  /** The exercises the user may add (already filtered for equipment etc.). */
  exercises: readonly ExerciseWithTags[];
  onSelect: (exercise: ExerciseWithTags) => void;
  /** Prefix for testIDs: `${prefix}-search`, `${prefix}-option-${id}`, `${prefix}-no-results`. */
  testIDPrefix: string;
  autoFocus?: boolean;
  /** Most results shown at once; keep typing to narrow. */
  limit?: number;
}

function muscleLine(exercise: ExerciseWithTags): string {
  return exercise.primaryMuscleKeys.map((key) => key.replace(/_/g, ' ')).join(' · ');
}

/**
 * FR-5.3: pick an exercise to add to a session by searching its name or
 * the muscles it works. Filters live as the user types (the list is
 * already on the device).
 */
export default function ExercisePicker({ exercises, onSelect, testIDPrefix, autoFocus, limit = 30 }: ExercisePickerProps) {
  const [query, setQuery] = useState('');
  const { results, total } = useMemo(() => searchExercises(exercises, query, { limit }), [exercises, query, limit]);

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput
          testID={`${testIDPrefix}-search`}
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercises or muscles"
          accessibilityLabel="Search exercises to add"
          autoFocus={autoFocus}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query ? (
          <Pressable
            testID={`${testIDPrefix}-search-clear`}
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            style={styles.clear}
          >
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {results.map((exercise) => (
        <Pressable
          key={exercise.id}
          testID={`${testIDPrefix}-option-${exercise.id}`}
          style={styles.optionRow}
          onPress={() => onSelect(exercise)}
          accessibilityRole="button"
          accessibilityLabel={`Add ${exercise.name}`}
        >
          <Text style={styles.optionText}>{exercise.name}</Text>
          {exercise.primaryMuscleKeys.length > 0 ? <Text style={styles.muscles}>{muscleLine(exercise)}</Text> : null}
        </Pressable>
      ))}

      {total === 0 ? (
        <Text testID={`${testIDPrefix}-no-results`} style={styles.note}>
          {query.trim() ? `No exercises match “${query.trim()}”.` : 'No exercises available to add.'}
        </Text>
      ) : total > results.length ? (
        <Text testID={`${testIDPrefix}-more`} style={styles.note}>
          {`Showing ${results.length} of ${total}. Keep typing to narrow.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, fontSize: 14 },
  clear: { paddingHorizontal: 10, paddingVertical: 6, marginLeft: 4 },
  clearText: { fontSize: 16, color: '#666' },
  optionRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  optionText: { fontSize: 14 },
  muscles: { fontSize: 12, color: '#666', marginTop: 2, textTransform: 'capitalize' },
  note: { fontSize: 13, color: '#666', paddingVertical: 8 },
});
