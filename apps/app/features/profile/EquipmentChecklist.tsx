import type { EquipmentItemRow } from 'api-client';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export interface EquipmentChecklistProps {
  items: EquipmentItemRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const CATEGORY_LABELS: Record<EquipmentItemRow['category'], string> = {
  free_weights: 'Free weights',
  machines: 'Machines',
  bodyweight_other: 'Bodyweight / other',
};

/**
 * FR-1.2: a granular equipment checklist grouped by category, with one-tap
 * presets that pre-check the underlying items, and granular editing
 * available without extra navigation depth (UX-2).
 */
export default function EquipmentChecklist({ items, selectedIds, onChange }: EquipmentChecklistProps) {
  const byCategory = new Map<EquipmentItemRow['category'], EquipmentItemRow[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((existing) => existing !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  function applyFullGymPreset() {
    onChange(items.map((item) => item.id));
  }

  function applyBodyweightOnlyPreset() {
    onChange(items.filter((item) => item.category === 'bodyweight_other').map((item) => item.id));
  }

  return (
    <View style={styles.container}>
      <View style={styles.presetRow}>
        <Pressable
          testID="equipment-preset-full-gym"
          style={styles.presetButton}
          onPress={applyFullGymPreset}
        >
          <Text style={styles.presetButtonText}>Full gym</Text>
        </Pressable>
        <Pressable
          testID="equipment-preset-bodyweight-only"
          style={styles.presetButton}
          onPress={applyBodyweightOnlyPreset}
        >
          <Text style={styles.presetButtonText}>Bodyweight only</Text>
        </Pressable>
      </View>

      <ScrollView>
        {Array.from(byCategory.entries()).map(([category, categoryItems]) => (
          <View key={category} style={styles.categorySection}>
            <Text style={styles.categoryTitle}>{CATEGORY_LABELS[category]}</Text>
            {categoryItems.map((item) => {
              const checked = selectedIds.includes(item.id);
              return (
                <Pressable
                  key={item.id}
                  testID={`equipment-item-${item.id}`}
                  style={styles.itemRow}
                  onPress={() => toggle(item.id)}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxChecked]} />
                  <Text style={styles.itemLabel}>{item.display_name}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  presetRow: { flexDirection: 'row', marginBottom: 16 },
  presetButton: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 10,
  },
  presetButtonText: { fontWeight: '600' },
  categorySection: { marginBottom: 16 },
  categoryTitle: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#111',
    marginRight: 10,
  },
  checkboxChecked: { backgroundColor: '#111' },
  itemLabel: { fontSize: 15 },
});
