import {
  deleteFoodLogEntry,
  getCurrentNutritionTargets,
  getFoodLogEntriesForDate,
  logFoodEntry,
  lookupFoodByBarcode,
  type FoodLogEntryForDiary,
  type GymSupabaseClient,
  type PersistedFoodItem,
  type PersistedNutritionTargets,
} from 'api-client';
import { computeDailyTotals, groupByMealSlot, type MealSlot } from 'core';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import EmptyState from '../../components/EmptyState';
import BarcodeScanScreen from './BarcodeScanScreen';
import CustomFoodForm from './CustomFoodForm';
import FoodSearchScreen from './FoodSearchScreen';
import ManualBarcodeEntry from './ManualBarcodeEntry';

export interface DiaryScreenProps {
  client: GymSupabaseClient;
  userId: string;
}

type Mode = 'diary' | 'search' | 'custom' | 'scan' | 'manual-barcode' | 'confirm-portion';

const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * FR-7.1/FR-7.2/FR-7.3/FR-7.4/UX-7/UX-8/AC-9/AC-10: the food diary — logs
 * entries via search, barcode scan, or manual/custom entry, and shows
 * running daily totals against the user's current nutrition targets.
 * Owns the whole search/scan/confirm flow inline (no Phase 11 navigation
 * exists yet), the same pattern SessionScreen established in Phase 7/8.
 */
export default function DiaryScreen({ client, userId }: DiaryScreenProps) {
  const [date] = useState(todayDateString());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<FoodLogEntryForDiary[]>([]);
  const [currentTargets, setCurrentTargets] = useState<PersistedNutritionTargets | null>(null);

  const [mode, setMode] = useState<Mode>('diary');
  const [selectedFood, setSelectedFood] = useState<PersistedFoodItem | null>(null);
  const [mealSlot, setMealSlot] = useState<MealSlot>('breakfast');
  const [portionQuantity, setPortionQuantity] = useState(1);
  const [barcodeNotice, setBarcodeNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [entriesRes, targetsRes] = await Promise.all([
      getFoodLogEntriesForDate(client, userId, date),
      getCurrentNutritionTargets(client, userId),
    ]);
    if (entriesRes.error) {
      setError(entriesRes.error);
    } else {
      setEntries(entriesRes.data ?? []);
    }
    if (targetsRes.error) {
      setError((prev) => prev ?? targetsRes.error);
    } else {
      setCurrentTargets(targetsRes.data);
    }
    setLoaded(true);
  }, [client, userId, date]);

  useEffect(() => {
    load();
  }, [load]);

  function handleStartSearch() {
    setError(null);
    setMode('search');
  }

  function handleStartScan() {
    setError(null);
    setBarcodeNotice(null);
    setMode('scan');
  }

  async function handleBarcodeResolved(barcode: string) {
    const result = await lookupFoodByBarcode(client, barcode);
    if (result.error) {
      setError(result.error);
      setMode('diary');
      return;
    }
    if (!result.data) {
      setBarcodeNotice(`No food found for barcode ${barcode}. Search or add it manually instead.`);
      setMode('manual-barcode');
      return;
    }
    handleSelectFood(result.data);
  }

  function handleSelectFood(food: PersistedFoodItem) {
    setSelectedFood(food);
    setMealSlot('breakfast');
    setPortionQuantity(1);
    setMode('confirm-portion');
  }

  function handleCancelFlow() {
    setSelectedFood(null);
    setBarcodeNotice(null);
    setMode('diary');
  }

  function adjustPortion(delta: number) {
    setPortionQuantity((prev) => Math.max(0.5, Math.round((prev + delta) * 2) / 2));
  }

  async function handleConfirmLog() {
    if (!selectedFood) return;
    setSaving(true);
    setError(null);
    const result = await logFoodEntry(client, userId, {
      foodItemId: selectedFood.id,
      mealSlot,
      portionQuantity,
      logDate: date,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSelectedFood(null);
    setMode('diary');
    await load();
  }

  async function handleDeleteEntry(entryId: string) {
    const result = await deleteFoodLogEntry(client, userId, entryId);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (!loaded) {
    return (
      <View style={styles.container}>
        <Text testID="diary-loading">Loading...</Text>
      </View>
    );
  }

  if (mode === 'search') {
    return <FoodSearchScreen client={client} onSelectFood={handleSelectFood} onCancel={handleCancelFlow} />;
  }

  if (mode === 'custom') {
    return <CustomFoodForm client={client} userId={userId} onCreated={handleSelectFood} onCancel={handleCancelFlow} />;
  }

  if (mode === 'scan') {
    return (
      <BarcodeScanScreen
        onBarcodeScanned={handleBarcodeResolved}
        onManualEntry={() => {
          setBarcodeNotice(null);
          setMode('manual-barcode');
        }}
      />
    );
  }

  if (mode === 'manual-barcode') {
    return (
      <ManualBarcodeEntry
        notice={barcodeNotice}
        onSubmit={handleBarcodeResolved}
        onCancel={handleCancelFlow}
      />
    );
  }

  if (mode === 'confirm-portion' && selectedFood) {
    return (
      <View style={styles.container} testID="diary-confirm-portion">
        <Text style={styles.title}>{selectedFood.name}</Text>
        <Text style={styles.subtle}>{selectedFood.portionDescription}</Text>

        <Text style={styles.label}>Meal</Text>
        <View style={styles.mealSlotRow}>
          {MEAL_SLOTS.map((slot) => (
            <Pressable
              key={slot}
              testID={`diary-meal-slot-${slot}`}
              style={[styles.mealSlotButton, mealSlot === slot && styles.mealSlotButtonActive]}
              onPress={() => setMealSlot(slot)}
              accessibilityRole="button"
              accessibilityState={{ selected: mealSlot === slot }}
            >
              <Text style={[styles.mealSlotText, mealSlot === slot && styles.mealSlotTextActive]}>
                {MEAL_SLOT_LABEL[slot]}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Portions</Text>
        <View style={styles.stepperRow}>
          <Pressable
            testID="diary-portion-dec"
            style={styles.stepperButton}
            onPress={() => adjustPortion(-0.5)}
            accessibilityRole="button"
            accessibilityLabel="Decrease portions"
          >
            <Text style={styles.stepperButtonText}>-</Text>
          </Pressable>
          <Text testID="diary-portion-value" style={styles.stepperValue}>
            {portionQuantity}
          </Text>
          <Pressable
            testID="diary-portion-inc"
            style={styles.stepperButton}
            onPress={() => adjustPortion(0.5)}
            accessibilityRole="button"
            accessibilityLabel="Increase portions"
          >
            <Text style={styles.stepperButtonText}>+</Text>
          </Pressable>
        </View>

        {error ? (
          <Text testID="diary-error" style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <Pressable
          testID="diary-confirm-log-button"
          style={styles.logButton}
          disabled={saving}
          onPress={handleConfirmLog}
          accessibilityRole="button"
        >
          <Text style={styles.logButtonText}>{saving ? 'Logging…' : 'Log food'}</Text>
        </Pressable>
        <Pressable
          testID="diary-confirm-cancel"
          style={styles.cancelButton}
          onPress={handleCancelFlow}
          accessibilityRole="button"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  const totals = computeDailyTotals(entries);
  const mealGroups = groupByMealSlot(entries);

  return (
    <ScrollView style={styles.container} testID="diary-screen">
      <Text style={styles.title}>Today&apos;s diary</Text>

      {error ? (
        <Text testID="diary-error" style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <View testID="diary-totals" style={styles.totalsCard}>
        <Text style={styles.totalsRow}>
          Calories: {Math.round(totals.calories)}
          {currentTargets ? ` / ${currentTargets.dailyCalories}` : ''}
        </Text>
        <Text style={styles.totalsRow}>
          Protein: {Math.round(totals.proteinG)}g{currentTargets ? ` / ${currentTargets.proteinG}g` : ''}
        </Text>
        <Text style={styles.totalsRow}>
          Carbs: {Math.round(totals.carbsG)}g{currentTargets ? ` / ${currentTargets.carbsG}g` : ''}
        </Text>
        <Text style={styles.totalsRow}>
          Fat: {Math.round(totals.fatG)}g{currentTargets ? ` / ${currentTargets.fatG}g` : ''}
        </Text>
      </View>

      {MEAL_SLOTS.map((slot) => {
        const slotEntries = mealGroups.get(slot) ?? [];
        if (slotEntries.length === 0) return null;
        return (
          <View key={slot} testID={`diary-meal-group-${slot}`} style={styles.mealGroup}>
            <Text style={styles.mealGroupTitle}>{MEAL_SLOT_LABEL[slot]}</Text>
            {slotEntries.map((entry) => (
              <View key={entry.id} testID={`diary-entry-${entry.id}`} style={styles.entryRow}>
                <View>
                  <Text style={styles.entryName}>{entry.foodName}</Text>
                  <Text style={styles.entryMeta}>
                    {entry.portionQuantity} × {entry.portionDescription} · {Math.round(entry.caloriesPerPortion * entry.portionQuantity)} kcal
                  </Text>
                </View>
                <Pressable
                  testID={`diary-entry-${entry.id}-delete`}
                  onPress={() => handleDeleteEntry(entry.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${entry.foodName} from today's diary`}
                >
                  <Text style={styles.deleteText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        );
      })}

      {entries.length === 0 ? (
        <EmptyState
          testID="diary-empty"
          title="No food logged yet today"
          message="Search for a food to log your first entry."
          actionLabel="Search food"
          onAction={handleStartSearch}
        />
      ) : null}

      <View style={styles.actionsRow}>
        <Pressable testID="diary-add-search-button" style={styles.actionButton} onPress={handleStartSearch} accessibilityRole="button">
          <Text style={styles.actionButtonText}>Search</Text>
        </Pressable>
        <Pressable testID="diary-add-scan-button" style={styles.actionButton} onPress={handleStartScan} accessibilityRole="button">
          <Text style={styles.actionButtonText}>Scan barcode</Text>
        </Pressable>
        <Pressable
          testID="diary-add-custom-button"
          style={styles.actionButton}
          onPress={() => {
            setError(null);
            setMode('custom');
          }}
          accessibilityRole="button"
        >
          <Text style={styles.actionButtonText}>Custom food</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
  subtle: { fontSize: 13, color: '#666', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  error: { color: '#b00020', marginVertical: 8 },
  totalsCard: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 14, marginBottom: 16 },
  totalsRow: { fontSize: 14, marginBottom: 4 },
  mealGroup: { marginBottom: 16 },
  mealGroupTitle: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  entryName: { fontSize: 14, fontWeight: '600' },
  entryMeta: { fontSize: 12, color: '#666' },
  deleteText: { color: '#b00020', fontSize: 13 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 24 },
  actionButton: { flex: 1, backgroundColor: '#111', borderRadius: 8, padding: 12, alignItems: 'center' },
  actionButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  mealSlotRow: { flexDirection: 'row', gap: 8 },
  mealSlotButton: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, alignItems: 'center' },
  mealSlotButtonActive: { backgroundColor: '#111', borderColor: '#111' },
  mealSlotText: { fontSize: 12, fontWeight: '600', color: '#111' },
  mealSlotTextActive: { color: '#fff' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperButton: {
    backgroundColor: '#111',
    borderRadius: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  stepperValue: { fontSize: 18, fontWeight: '600', minWidth: 40, textAlign: 'center' },
  logButton: { backgroundColor: '#111', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  logButtonText: { color: '#fff', fontWeight: '600' },
  cancelButton: { marginTop: 12, alignItems: 'center' },
  cancelButtonText: { color: '#666' },
});
