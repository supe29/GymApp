import { createCustomFoodItem, type GymSupabaseClient, type PersistedFoodItem } from 'api-client';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export interface CustomFoodFormProps {
  client: GymSupabaseClient;
  userId: string;
  onCreated: (food: PersistedFoodItem) => void;
  onCancel: () => void;
}

function parseNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** FR-7.1/DR-2/A-7: manual macro entry — the fallback when a food can't be found by search or barcode. Private to its creator. */
export default function CustomFoodForm({ client, userId, onCreated, onCancel }: CustomFoodFormProps) {
  const [name, setName] = useState('');
  const [portionDescription, setPortionDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && portionDescription.trim().length > 0 && calories.trim().length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    const result = await createCustomFoodItem(client, userId, {
      name: name.trim(),
      portionDescription: portionDescription.trim(),
      caloriesPerPortion: parseNumber(calories),
      proteinGPerPortion: parseNumber(protein),
      carbsGPerPortion: parseNumber(carbs),
      fatGPerPortion: parseNumber(fat),
    });
    setSaving(false);
    if (result.error || !result.data) {
      setError(result.error ?? 'Failed to save this food.');
      return;
    }
    onCreated(result.data);
  }

  return (
    <View style={styles.container} testID="custom-food-form">
      <Text style={styles.title}>Add a custom food</Text>

      {error ? (
        <Text testID="custom-food-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <Text style={styles.label}>Name</Text>
      <TextInput
        testID="custom-food-name"
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Mom's lasagna"
        accessibilityLabel="Food name"
      />

      <Text style={styles.label}>Portion</Text>
      <TextInput
        testID="custom-food-portion"
        style={styles.input}
        value={portionDescription}
        onChangeText={setPortionDescription}
        placeholder="e.g. 1 slice"
        accessibilityLabel="Portion description"
      />

      <Text style={styles.label}>Calories</Text>
      <TextInput
        testID="custom-food-calories"
        style={styles.input}
        value={calories}
        onChangeText={setCalories}
        keyboardType="numeric"
        accessibilityLabel="Calories per portion"
      />

      <Text style={styles.label}>Protein (g)</Text>
      <TextInput
        testID="custom-food-protein"
        style={styles.input}
        value={protein}
        onChangeText={setProtein}
        keyboardType="numeric"
        accessibilityLabel="Protein grams per portion"
      />

      <Text style={styles.label}>Carbs (g)</Text>
      <TextInput
        testID="custom-food-carbs"
        style={styles.input}
        value={carbs}
        onChangeText={setCarbs}
        keyboardType="numeric"
        accessibilityLabel="Carbohydrate grams per portion"
      />

      <Text style={styles.label}>Fat (g)</Text>
      <TextInput
        testID="custom-food-fat"
        style={styles.input}
        value={fat}
        onChangeText={setFat}
        keyboardType="numeric"
        accessibilityLabel="Fat grams per portion"
      />

      <Pressable
        testID="custom-food-submit"
        style={styles.submitButton}
        disabled={!canSubmit || saving}
        onPress={handleSubmit}
        accessibilityRole="button"
      >
        <Text style={styles.submitButtonText}>{saving ? 'Saving…' : 'Save food'}</Text>
      </Pressable>
      <Pressable testID="custom-food-cancel" style={styles.cancelButton} onPress={onCancel} accessibilityRole="button">
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  error: { color: '#b00020', marginBottom: 8 },
  submitButton: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  cancelButton: { marginTop: 12, alignItems: 'center' },
  cancelButtonText: { color: '#666' },
});
