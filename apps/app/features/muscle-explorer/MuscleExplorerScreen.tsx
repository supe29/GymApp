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
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BodyModel, DemoFigure, type BodyModelHandle, type ModelSide } from 'three-model';

import { getSupabaseClient } from '../../lib/supabaseClient';
import MuscleListFallback from './MuscleListFallback';
import { demoForExercise } from './prototypeDemoClips';

/** Match the 3D model's highlight colors (packages/three-model shared/BodyModelScene.tsx). */
const PRIMARY_MUSCLE_COLOR = '#e0442f';
const SECONDARY_MUSCLE_COLOR = '#f0a33a';
/** Below this window width the demo figure stacks under the main model. */
const SIDE_BY_SIDE_MIN_WIDTH = 700;

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
  const [activeExercise, setActiveExercise] = useState<ExerciseWithTags | null>(null);
  const [side, setSide] = useState<ModelSide>('front');
  const [demoPaused, setDemoPaused] = useState(false);
  const bodyModelRef = useRef<BodyModelHandle>(null);
  const { width: windowWidth } = useWindowDimensions();

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
  const activeMuscles = useMemo(
    () =>
      activeExercise
        ? { primary: activeExercise.primaryMuscleKeys, secondary: activeExercise.secondaryMuscleKeys }
        : null,
    [activeExercise],
  );
  const demo = activeExercise ? demoForExercise(activeExercise.name) : null;

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
          <Text style={[styles.toggleText, viewMode === '3d' && styles.toggleTextActive]}>3D view</Text>
        </Pressable>
        <Pressable
          testID="muscle-explorer-toggle-list"
          style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
          onPress={() => setViewMode('list')}
          accessibilityRole="button"
          accessibilityLabel="List view (non-visual alternative to the 3D model)"
          accessibilityState={{ selected: viewMode === 'list' }}
        >
          <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>List view</Text>
        </Pressable>
      </View>

      <View style={styles.viewArea}>
        {viewMode === '3d' ? (
          <View
            testID="muscle-explorer-models"
            style={[styles.models, windowWidth >= SIDE_BY_SIDE_MIN_WIDTH && styles.modelsSideBySide]}
          >
            <View style={styles.modelPane}>
            <BodyModel
              ref={bodyModelRef}
              onSelectionChange={(id) => {
                setSelectedRegionId(id);
                setActiveExercise(null);
              }}
              activeExerciseMuscles={activeMuscles}
            />
            <View style={styles.viewControls}>
              <View style={styles.sideToggle}>
                {(['front', 'back'] as const).map((s) => (
                  <Pressable
                    key={s}
                    testID={`muscle-explorer-side-${s}`}
                    style={[styles.sideButton, side === s && styles.sideButtonActive]}
                    onPress={() => {
                      bodyModelRef.current?.showSide(s);
                      setSide(s);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${s}`}
                    accessibilityState={{ selected: side === s }}
                  >
                    <Text style={[styles.sideButtonText, side === s && styles.toggleTextActive]}>
                      {s === 'front' ? 'Front' : 'Back'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                testID="muscle-explorer-reset"
                style={styles.resetButton}
                onPress={() => {
                  bodyModelRef.current?.reset();
                  setSide('front');
                  setActiveExercise(null);
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.toggleText, styles.toggleTextActive]}>Reset view</Text>
              </Pressable>
            </View>
            {/* Required by the model's CC BY-SA licence (docs/licensing/anatomical-mesh-license.md). */}
            <Text testID="muscle-explorer-model-credit" style={styles.modelCredit}>
              3D anatomy adapted from Z-Anatomy (CC BY-SA 4.0), based on BodyParts3D © DBCLS (CC BY-SA 2.1 JP)
            </Text>
            </View>
            {activeExercise ? (
              <View testID="muscle-explorer-demo" style={styles.modelPane}>
                <DemoFigure clip={demo?.clip ?? null} muscles={activeMuscles} paused={demoPaused} />
                <Text numberOfLines={1} style={styles.demoTitle}>{activeExercise.name}</Text>
                {demo ? (
                  <Pressable
                    testID="muscle-explorer-demo-pause"
                    style={[styles.resetButton, styles.demoPause]}
                    onPress={() => setDemoPaused((paused) => !paused)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.toggleText, styles.toggleTextActive]}>{demoPaused ? 'Play' : 'Pause'}</Text>
                  </Pressable>
                ) : null}
                <Text testID="muscle-explorer-demo-note" style={styles.demoNote}>
                  {demo
                    ? `Shows general movement, not personal coaching.${demo.note ? ` ${demo.note}` : ''}`
                    : 'No movement demo for this exercise yet. Worked muscles are highlighted.'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <MuscleListFallback
            muscleGroups={muscleGroups}
            selectedKey={selectedRegionId}
            onSelect={setSelectedRegionId}
          />
        )}
      </View>

      {viewMode === '3d' && activeExercise ? (
        <View testID="muscle-explorer-legend" style={styles.viewNote}>
          <View style={[styles.legendSwatch, { backgroundColor: PRIMARY_MUSCLE_COLOR }]} />
          <Text style={styles.viewNoteText}>Primary</Text>
          <View style={[styles.legendSwatch, { backgroundColor: SECONDARY_MUSCLE_COLOR }]} />
          <Text style={styles.viewNoteText}>Secondary</Text>
        </View>
      ) : null}
      {viewMode === '3d' && !selectedRegionId ? (
        <View testID="muscle-explorer-hint" style={styles.viewNote}>
          <Text style={styles.viewNoteText}>Tap a muscle to see exercises · drag to rotate</Text>
        </View>
      ) : null}

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
                onPress={() => {
                  setActiveExercise(item);
                  onSelectExercise?.(item);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: activeExercise?.id === item.id }}
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
  toggleText: { fontWeight: '600', color: '#111' },
  toggleTextActive: { color: '#fff' },
  viewArea: { flex: 1, minHeight: 240 },
  models: { flex: 1 },
  modelsSideBySide: { flexDirection: 'row' },
  modelPane: { flex: 1, position: 'relative' },
  demoTitle: { position: 'absolute', top: 12, left: 12, right: 90, fontWeight: '600', color: '#111' },
  demoPause: { position: 'absolute', top: 8, right: 8 },
  demoNote: { position: 'absolute', bottom: 4, left: 8, right: 8, color: '#444', fontSize: 11, textAlign: 'center' },
  viewControls: { position: 'absolute', top: 8, right: 8, alignItems: 'flex-end', gap: 8 },
  sideToggle: { flexDirection: 'row', borderWidth: 1, borderColor: '#111', borderRadius: 8, overflow: 'hidden' },
  sideButton: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff' },
  sideButtonActive: { backgroundColor: '#111' },
  sideButtonText: { fontWeight: '600', color: '#111' },
  viewNote: {
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  viewNoteText: { color: '#444', fontSize: 13 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  modelCredit: { position: 'absolute', bottom: 4, left: 8, right: 8, color: '#777', fontSize: 10 },
  resetButton: {
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
