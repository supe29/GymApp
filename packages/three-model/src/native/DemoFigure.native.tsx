// Native adapter of the exercise demo figure, mirroring DemoFigure.web.tsx.
// UNVERIFIED like BodyModel.native.tsx until it has run on a device or
// emulator (see docs/deferred-production-checks.md).
import { Canvas } from '@react-three/fiber/native';
import { useRef, useState } from 'react';
import { PanResponder, View, type GestureResponderEvent } from 'react-native';

import type { DemoFigureProps } from '../BodyModelTypes';
import { dragDeltaToRotation } from '../gestureMath';
import { interactionReducer } from '../interactionContract';
import DemoScene from '../shared/DemoScene';
import { DEMO_REGION_IDS, demoInitialState } from '../shared/demoCamera';

export default function DemoFigure({ clip, muscles, paused, holdPhase }: DemoFigureProps) {
  const [state, setState] = useState(demoInitialState);
  const lastTouch = useRef<{ x: number; y: number } | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (event: GestureResponderEvent) => {
        const touch = event.nativeEvent.touches[0];
        if (!touch) return;
        if (lastTouch.current) {
          const dx = touch.pageX - lastTouch.current.x;
          const dy = touch.pageY - lastTouch.current.y;
          setState((prev) =>
            interactionReducer(prev, { type: 'rotate', ...dragDeltaToRotation(dx, dy) }, DEMO_REGION_IDS, Date.now()),
          );
        }
        lastTouch.current = { x: touch.pageX, y: touch.pageY };
      },
      onPanResponderRelease: () => {
        lastTouch.current = null;
      },
      onPanResponderTerminate: () => {
        lastTouch.current = null;
      },
    }),
  ).current;

  return (
    <View testID="demo-figure-native-container" style={{ flex: 1 }} {...panResponder.panHandlers}>
      <Canvas camera={{ fov: 45, position: [0, 1, 3] }}>
        <DemoScene camera={state.camera} clip={clip} muscles={muscles} paused={paused} holdPhase={holdPhase} />
      </Canvas>
    </View>
  );
}
