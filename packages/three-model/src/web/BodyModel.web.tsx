// Phase 4 web adapter (@react-three/fiber, ADR-3). Deliberately thin: its
// only jobs are (a) capturing raw DOM pointer/wheel events and converting
// them to normalized deltas via ../gestureMath, and (b) rendering the
// shared ../shared/BodyModelScene inside a web <Canvas>. All state
// transitions go through ../interactionContract's interactionReducer —
// this file contains no camera or hit-testing math of its own.
import { Canvas } from '@react-three/fiber';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import type { BodyModelHandle, BodyModelProps } from '../BodyModelTypes';
import { dragDeltaToRotation, wheelDeltaToZoom } from '../gestureMath';
import {
  defaultInteractionState,
  interactionReducer,
  type InteractionAction,
  type InteractionState,
} from '../interactionContract';
import { MUSCLE_REGION_IDS } from '../muscleRegions';
import BodyModelScene from '../shared/BodyModelScene';

const BodyModel = forwardRef<BodyModelHandle, BodyModelProps>(function BodyModel(
  { onSelectionChange, onInteractionStateChange, activeExerciseMuscles },
  ref,
) {
  const [state, setState] = useState<InteractionState>(defaultInteractionState());
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

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

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    dragOrigin.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragOrigin.current) return;
    const dx = event.clientX - dragOrigin.current.x;
    const dy = event.clientY - dragOrigin.current.y;
    dragOrigin.current = { x: event.clientX, y: event.clientY };
    dispatch({ type: 'rotate', ...dragDeltaToRotation(dx, dy) });
  }

  function endDrag() {
    dragOrigin.current = null;
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    dispatch({ type: 'zoom', deltaZoom: wheelDeltaToZoom(event.deltaY) });
  }

  return (
    <div
      data-testid="body-model-web-container"
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onWheel={handleWheel}
    >
      <Canvas camera={{ fov: 45, position: [0, 1, 3] }}>
        <BodyModelScene
          state={state}
          onRegionTap={(regionId) => dispatch({ type: 'select', regionId })}
          activeExerciseMuscles={activeExerciseMuscles}
        />
      </Canvas>
    </div>
  );
});

export default BodyModel;
