// Phase 4 native adapter (expo-gl, via @react-three/fiber/native, ADR-3).
// Deliberately thin, mirroring BodyModel.web.tsx's structure exactly: its
// only jobs are (a) capturing raw touch events via React Native's built-in
// PanResponder and converting them to normalized deltas via
// ../gestureMath (the *same* shared functions the web adapter uses), and
// (b) rendering the shared ../shared/BodyModelScene inside a native
// <Canvas>. All state transitions go through
// ../interactionContract's interactionReducer.
//
// UNVERIFIED IN THIS ENVIRONMENT: there is no native iOS/Android runtime
// available here (see docs/deferred-production-checks.md), so unlike the
// web adapter and the shared contract/gesture-math modules, this file's
// actual touch-to-gesture wiring has not been executed or tested. Its
// conformance to the shared contract is a structural guarantee (it calls
// the exact same interactionReducer/gestureMath functions the web adapter
// does, not a reimplementation) rather than an empirically verified one.
import { Canvas } from '@react-three/fiber/native';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { PanResponder, View, type GestureResponderEvent } from 'react-native';

import type { BodyModelHandle, BodyModelProps } from '../BodyModelTypes';
import { dragDeltaToRotation, pinchDeltaToZoom } from '../gestureMath';
import {
  defaultInteractionState,
  interactionReducer,
  type InteractionAction,
  type InteractionState,
} from '../interactionContract';
import { MUSCLE_REGION_IDS } from '../muscleRegions';
import BodyModelScene from '../shared/BodyModelScene';

function touchDistance(touches: readonly { pageX: number; pageY: number }[]): number | null {
  if (touches.length < 2) return null;
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

const BodyModel = forwardRef<BodyModelHandle, BodyModelProps>(function BodyModel(
  { onSelectionChange, onInteractionStateChange, activeExerciseMuscles },
  ref,
) {
  const [state, setState] = useState<InteractionState>(defaultInteractionState());
  const lastTouch = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistance = useRef<number | null>(null);

  // The latest state, read synchronously by dispatch so the parent
  // callbacks run outside React's setState updater (calling them inside it
  // updated the parent screen mid-render).
  const stateRef = useRef(state);

  const dispatch = useCallback(
    (action: InteractionAction) => {
      const prev = stateRef.current;
      const next = interactionReducer(prev, action, MUSCLE_REGION_IDS, Date.now());
      stateRef.current = next;
      setState(next);
      onInteractionStateChange?.(next);
      if (action.type === 'select' && next.selection.regionId !== prev.selection.regionId) {
        onSelectionChange?.(next.selection.regionId);
      }
    },
    [onInteractionStateChange, onSelectionChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      reset: () => dispatch({ type: 'reset' }),
      showSide: (side) => dispatch({ type: 'face', side }),
    }),
    [dispatch],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (event: GestureResponderEvent) => {
        const touches = event.nativeEvent.touches;

        if (touches.length >= 2) {
          const distance = touchDistance(touches);
          if (distance !== null) {
            if (lastPinchDistance.current !== null) {
              dispatch({
                type: 'zoom',
                deltaZoom: pinchDeltaToZoom(distance - lastPinchDistance.current),
              });
            }
            lastPinchDistance.current = distance;
          }
          lastTouch.current = null;
          return;
        }

        lastPinchDistance.current = null;
        const touch = touches[0];
        if (!touch) return;
        if (lastTouch.current) {
          const dx = touch.pageX - lastTouch.current.x;
          const dy = touch.pageY - lastTouch.current.y;
          dispatch({ type: 'rotate', ...dragDeltaToRotation(dx, dy) });
        }
        lastTouch.current = { x: touch.pageX, y: touch.pageY };
      },
      onPanResponderRelease: () => {
        lastTouch.current = null;
        lastPinchDistance.current = null;
      },
      onPanResponderTerminate: () => {
        lastTouch.current = null;
        lastPinchDistance.current = null;
      },
    }),
  ).current;

  return (
    <View testID="body-model-native-container" style={{ flex: 1 }} {...panResponder.panHandlers}>
      <Canvas camera={{ fov: 45, position: [0, 1, 3] }}>
        <BodyModelScene
          state={state}
          onRegionTap={(regionId) => dispatch({ type: 'select', regionId })}
          activeExerciseMuscles={activeExerciseMuscles}
        />
      </Canvas>
    </View>
  );
});

export default BodyModel;
