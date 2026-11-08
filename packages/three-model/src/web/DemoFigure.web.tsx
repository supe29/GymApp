// Web adapter of the exercise demo figure. Like BodyModel.web.tsx it only
// captures raw gestures and hosts the shared scene; the figure can be
// rotated but has no selectable regions.
import { Canvas } from '@react-three/fiber';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import type { DemoFigureProps } from '../BodyModelTypes';
import { dragDeltaToRotation } from '../gestureMath';
import { interactionReducer } from '../interactionContract';
import DemoScene from '../shared/DemoScene';
import { DEMO_REGION_IDS, demoInitialState } from '../shared/demoCamera';

export default function DemoFigure({ clip, muscles, paused, holdPhase }: DemoFigureProps) {
  const [state, setState] = useState(demoInitialState);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragOrigin.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragOrigin.current) return;
    const dx = event.clientX - dragOrigin.current.x;
    const dy = event.clientY - dragOrigin.current.y;
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    setState((prev) =>
      interactionReducer(prev, { type: 'rotate', ...dragDeltaToRotation(dx, dy) }, DEMO_REGION_IDS, Date.now()),
    );
  }

  function endDrag() {
    dragOrigin.current = null;
  }

  return (
    <div
      data-testid="demo-figure-web-container"
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <Canvas camera={{ fov: 45, position: [0, 1, 3] }}>
        <DemoScene camera={state.camera} clip={clip} muscles={muscles} paused={paused} holdPhase={holdPhase} />
      </Canvas>
    </div>
  );
}
