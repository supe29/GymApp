import type { MuscleGroupRow } from 'api-client';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

export interface MuscleListFallbackProps {
  muscleGroups: MuscleGroupRow[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

/**
 * NFR-5: a non-visual fallback for users who cannot use the 3D model —
 * a plain list of muscle groups reaching the same muscle-to-exercise
 * browsing capability (AC-5) as tapping a region in the 3D view.
 */
export default function MuscleListFallback({
  muscleGroups,
  selectedKey,
  onSelect,
}: MuscleListFallbackProps) {
  return (
    <FlatList
      testID="muscle-list-fallback"
      data={muscleGroups}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => {
        const selected = item.key === selectedKey;
        return (
          <Pressable
            testID={`muscle-list-item-${item.key}`}
            style={[styles.row, selected && styles.rowSelected]}
            onPress={() => onSelect(item.key)}
            accessibilityRole="button"
            accessibilityLabel={item.display_name}
          >
            <Text style={styles.label}>{item.display_name}</Text>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text>No muscle groups available.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  rowSelected: { backgroundColor: '#f0f0f0' },
  label: { fontSize: 16 },
  empty: { padding: 24, alignItems: 'center' },
});
