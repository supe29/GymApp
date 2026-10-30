import {
  getExercisesWithTags,
  getUserEquipmentIds,
  listEquipmentItems,
  listMuscleGroups,
  type GymSupabaseClient,
  type MuscleGroupRow,
} from 'api-client';
import { filterByEquipmentSubset, filterByMuscleGroup, type ExerciseWithTags } from 'core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { BodyModel, type BodyModelHandle } from 'three-model';

import { getSupabaseClient } from '../../lib/supabaseClient';
import MuscleListFallback from './MuscleListFallback';

export interface MuscleExplorerScreenProps {
  client?: GymSupabaseClient;
  userId: string;
  onSelectExercise?: (exercise: ExerciseWithTags) => void;
}

/**
 * FR-4.1/FR-4.2/FR-4.4/NFR-5/UX-5: the 3D muscle explorer, with an
 * always-reachable non-visual fallback (not hidden behind an unrelated
 * flow) and results filtered by the user's declared equipment (spec.md
 * flow 2.4).
 */
export default function MuscleExplorerScreen({
  client = getSupabaseClient(),
  userId,
  onSelectExercise,
}: MuscleExplorerScreenProps) {
  const [viewMode, setViewMode] = useState<'3d' | 'list'>('3d');
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroupRow[]>([]);
  const [exercises, setExercises] = useState<ExerciseWithTags[]>([]);
  const [availableEquipmentKeys, setAvailableEquipmentKeys] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const bodyModelRef = useRef<BodyModelHandle>(null);

  useEffect(() => {
    async function load() {
      const [muscleGroupsResult, exercisesResult, equipmentIdsResult, equipmentItemsResult] =
        await Promise.all([
          listMuscleGroups(client),
          getExercisesWithTags(client),
          getUserEquipmentIds(client, userId),
          listEquipmentItems(client),
        ]);

      setMuscleGroups(muscleGroupsResult.data ?? []);
      setExercises(exercisesResult.data ?? []);

      const equipmentIds = new Set(equipmentIdsResult.data ?? []);
      const keys = (equipmentItemsResult.data ?? [])
        .filter((item) => equipmentIds.has(item.id))
        .map((item) => item.key);
      setAvailableEquipmentKeys(keys);
      setLoaded(true);
    }
    load();
  }, [client, userId]);

  const matchingExercises = useMemo(() => {
    if (!selectedRegionId) return [];
    const byMuscle = filterByMuscleGroup(exercises, selectedRegionId);
    return filterByEquipmentSubset(byMuscle, availableEquipmentKeys);
  }, [exercises, selectedRegionId, availableEquipmentKeys]);

  const selectedRegionLabel = muscleGroups.find((m) => m.key === selectedRegionId)?.display_name;

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <Pressable
          testID="muscle-explorer-toggle-3d"
          style={[styles.toggleButton, viewMode === '3d' && styles.toggleButtonActive]}
          onPress={() => setViewMode('3d')}
          accessibilityRole="button"
          accessibilityState={{ selected: viewMode === '3d' }}
        >
          <Text style={styles.toggleText}>3D view</Text>
        </Pressable>
        <Pressable
          testID="muscle-explorer-toggle-list"
          style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
          onPress={() => setViewMode('list')}
          accessibilityRole="button"
          accessibilityLabel="List view (non-visual alternative to the 3D model)"
          accessibilityState={{ selected: viewMode === 'list' }}
        >
          <Text style={styles.toggleText}>List view</Text>
        </Pressable>
      </View>

      <View style={styles.viewArea}>
        {viewMode === '3d' ? (
          <>
            <BodyModel ref={bodyModelRef} onSelectionChange={setSelectedRegionId} />
            <Pressable
              testID="muscle-explorer-reset"
              style={styles.resetButton}
              onPress={() => bodyModelRef.current?.reset()}
              accessibilityRole="button"
            >
              <Text style={styles.toggleText}>Reset view</Text>
            </Pressable>
          </>
        ) : (
          <MuscleListFallback
            muscleGroups={muscleGroups}
            selectedKey={selectedRegionId}
            onSelect={setSelectedRegionId}
          />
        )}
      </View>

      {loaded && selectedRegionId ? (
        <View style={styles.resultsArea}>
          <Text style={styles.resultsTitle}>
            Exercises for {selectedRegionLabel ?? selectedRegionId}
          </Text>
          <FlatList
            testID="muscle-explorer-exercise-list"
            data={matchingExercises}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                testID={`muscle-explorer-exercise-${item.id}`}
                style={styles.exerciseRow}
                onPress={() => onSelectExercise?.(item)}
                accessibilityRole="button"
              >
                <Text>{item.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text testID="muscle-explorer-no-exercises" style={styles.empty}>
                No exercises match your available equipment for this muscle group.
              </Text>
            }
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toggleRow: { flexDirection: 'row', padding: 12, gap: 8 },
  toggleButton: {
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  toggleButtonActive: { backgroundColor: '#111' },
  toggleText: { fontWeight: '600' },
  viewArea: { flex: 1, minHeight: 240 },
  resetButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#111',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  resultsArea: { flex: 1, padding: 12 },
  resultsTitle: { fontWeight: '600', marginBottom: 8 },
  exerciseRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
  empty: { padding: 16, textAlign: 'center', color: '#666' },
});
