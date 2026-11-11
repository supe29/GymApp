import { useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { DemoFigure } from 'three-model';

import { DEMO_MODEL_CREDIT, demoForExercise } from '../features/exercise-demo/prototypeDemoClips';
import ThreeErrorBoundary from './ThreeErrorBoundary';

export interface ExerciseDemoPanelProps {
  exerciseName: string;
  /** Muscle-group keys to light up on the figure; null shows the figure without highlights. */
  muscles?: { primary: readonly string[]; secondary: readonly string[] } | null;
  testID?: string;
}

/** How far outside the viewport a figure starts (and keeps) running, so it is ready as it scrolls in. */
const NEAR_VIEWPORT_MARGIN = '300px';

/**
 * Whether the panel is on or near the screen. Each demo figure is its own
 * WebGL context and browsers allow only about 16 at once: past that,
 * Chrome drops the oldest and Firefox fails to create the new one, which
 * throws during render. A session lists every exercise with its demo, so
 * only the figures near the viewport get a live canvas. Without
 * IntersectionObserver (native, tests) every figure stays mounted.
 */
function useNearViewport(): [RefObject<View | null>, boolean] {
  const ref = useRef<View>(null);
  const observable = Platform.OS === 'web' && typeof IntersectionObserver !== 'undefined';
  const [near, setNear] = useState(!observable);

  useEffect(() => {
    if (!observable) return;
    // On react-native-web a View's ref is its DOM element.
    const node = ref.current as unknown as Element | null;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => setNear(entries.some((e) => e.isIntersecting)), {
      rootMargin: NEAR_VIEWPORT_MARGIN,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [observable]);

  return [ref, near];
}


/**
 * The animated exercise demo shown on the plan and session screens: the
 * same rigged figure and clip map as the Muscle Explorer, with
 * play/pause, and a note only where the clip differs from the exercise.
 * The licence credit is not repeated per panel: the screen shows
 * DemoModelCredit once.
 */
export default function ExerciseDemoPanel({ exerciseName, muscles = null, testID = 'exercise-demo' }: ExerciseDemoPanelProps) {
  const [paused, setPaused] = useState(false);
  const [containerRef, nearViewport] = useNearViewport();
  const demo = demoForExercise(exerciseName);

  return (
    <View ref={containerRef} testID={testID} style={styles.container}>
      <View style={styles.figure}>
        {nearViewport ? (
          <ThreeErrorBoundary
            label="ExerciseDemoPanel"
            fallback={(error) => (
              <View testID={`${testID}-unavailable`}>
                <Text style={styles.placeholderText}>The 3D demo couldn&apos;t start on this device.</Text>
                {/* Development builds only: the underlying reason, for diagnosis. */}
                {__DEV__ ? (
                  <Text testID={`${testID}-unavailable-reason`} style={styles.errorDetail} selectable>
                    {error.message || String(error)}
                  </Text>
                ) : null}
              </View>
            )}
          >
            <DemoFigure clip={demo?.clip ?? null} muscles={muscles} paused={paused} />
          </ThreeErrorBoundary>
        ) : (
          <Text testID={`${testID}-placeholder`} style={styles.placeholderText}>
            Loading demo…
          </Text>
        )}
        {demo ? (
          <Pressable
            testID={`${testID}-pause`}
            style={styles.pauseButton}
            onPress={() => setPaused((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={paused ? `Play ${exerciseName} demo` : `Pause ${exerciseName} demo`}
          >
            <Text style={styles.pauseText}>{paused ? 'Play' : 'Pause'}</Text>
          </Pressable>
        ) : null}
      </View>
      {/* Only a note that says something about this exercise: where the clip differs from it, or that it has none. */}
      {!demo || demo.note ? (
        <Text testID={`${testID}-note`} style={styles.note}>
          {demo ? demo.note : NO_DEMO_NOTE}
        </Text>
      ) : null}
    </View>
  );
}

const NO_DEMO_NOTE = 'No movement demo for this exercise yet. Worked muscles are highlighted.';

/**
 * The mesh licence credit (CC BY-SA, docs/licensing/anatomical-mesh-license.md).
 * It must be visible wherever the figure is shown, so a screen that renders
 * any ExerciseDemoPanel also renders this once, rather than under every demo.
 */
export function DemoModelCredit({ testID = 'demo-model-credit' }: { testID?: string }) {
  return (
    <Text testID={testID} style={styles.credit}>
      {DEMO_MODEL_CREDIT}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, borderRadius: 8, backgroundColor: '#f5f5f5', overflow: 'hidden' },
  figure: { height: 260, position: 'relative', justifyContent: 'center' },
  placeholderText: { textAlign: 'center', color: '#777', fontSize: 13, paddingHorizontal: 16 },
  errorDetail: { textAlign: 'center', color: '#b00020', fontSize: 11, paddingHorizontal: 16, marginTop: 6 },
  pauseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#111',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pauseText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  note: { fontSize: 12, color: '#444', textAlign: 'center', paddingHorizontal: 8, paddingVertical: 6 },
  credit: { fontSize: 10, color: '#888', textAlign: 'center', paddingHorizontal: 8, paddingVertical: 12 },
});
