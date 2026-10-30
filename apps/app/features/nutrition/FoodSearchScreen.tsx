import { searchFoodItems, type GymSupabaseClient, type PersistedFoodItem } from 'api-client';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export interface FoodSearchScreenProps {
  client: GymSupabaseClient;
  onSelectFood: (food: PersistedFoodItem) => void;
  onCancel: () => void;
}

/** FR-7.1/UX-7: free-text food search, one of the two primary logging paths (search/scan, manual entry is the fallback). */
export default function FoodSearchScreen({ client, onSelectFood, onCancel }: FoodSearchScreenProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersistedFoodItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    const result = await searchFoodItems(client, query.trim());
    setSearching(false);
    setSearched(true);
    if (result.error) {
      setError(result.error);
      return;
    }
    setResults(result.data ?? []);
  }

  return (
    <View style={styles.container} testID="food-search-screen">
      <Text style={styles.title}>Search food</Text>
      <View style={styles.searchRow}>
        <TextInput
          testID="food-search-input"
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. banana"
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <Pressable testID="food-search-button" style={styles.searchButton} disabled={searching} onPress={handleSearch}>
          <Text style={styles.searchButtonText}>{searching ? '…' : 'Search'}</Text>
        </Pressable>
      </View>

      {error ? (
        <Text testID="food-search-error" style={styles.error}>
          {error}
        </Text>
      ) : null}

      {searched && !error && results.length === 0 ? (
        <Text testID="food-search-empty">No foods found for &quot;{query}&quot;.</Text>
      ) : null}

      <FlatList
        testID="food-search-results"
        data={results}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable testID={`food-search-result-${item.id}`} style={styles.resultRow} onPress={() => onSelectFood(item)}>
            <Text style={styles.resultName}>{item.name}</Text>
            <Text style={styles.resultMeta}>
              {item.portionDescription} · {item.caloriesPerPortion} kcal
            </Text>
          </Pressable>
        )}
      />

      <Pressable testID="food-search-cancel" style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  searchButton: { backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  searchButtonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b00020', marginBottom: 8 },
  resultRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  resultName: { fontSize: 15, fontWeight: '600' },
  resultMeta: { fontSize: 13, color: '#666' },
  cancelButton: { marginTop: 12, alignItems: 'center' },
  cancelButtonText: { color: '#666' },
});
