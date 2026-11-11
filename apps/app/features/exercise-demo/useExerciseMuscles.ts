import { getMuscleKeysForExercises, type ExerciseMuscleKeys, type GymSupabaseClient } from 'api-client';
import { useCallback, useRef, useState } from 'react';

/**
 * Muscle keys for exercises whose demo the user has opened, fetched on
 * first open and cached for the screen's lifetime. A failed lookup leaves
 * the figure unhighlighted rather than blocking the demo.
 */
export function useExerciseMuscles(client: GymSupabaseClient) {
  const [musclesById, setMusclesById] = useState<ReadonlyMap<string, ExerciseMuscleKeys>>(new Map());
  const requested = useRef(new Set<string>());

  const request = useCallback(
    async (exerciseId: string) => {
      if (requested.current.has(exerciseId)) return;
      requested.current.add(exerciseId);
      try {
        const result = await getMuscleKeysForExercises(client, [exerciseId]);
        const keys = result.data?.get(exerciseId);
        if (keys) {
          setMusclesById((prev) => new Map(prev).set(exerciseId, keys));
        }
      } catch {
        // Leave the figure unhighlighted; the demo itself still plays.
      }
    },
    [client],
  );

  const musclesFor = useCallback((exerciseId: string) => musclesById.get(exerciseId) ?? null, [musclesById]);

  return { request, musclesFor };
}
