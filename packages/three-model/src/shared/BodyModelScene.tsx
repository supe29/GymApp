// Phase 4: the actual 3D scene content, shared verbatim between the web
// and native adapters — only the outer <Canvas> import and raw-gesture
// capture differ per platform (see ../web/BodyModel.web.tsx and
// ../native/BodyModel.native.tsx). Everything in this file runs through
// @react-three/fiber's platform-agnostic hooks (`useFrame`) and JSX
// intrinsics (`mesh`, `boxGeometry`, ...), which behave identically
// whether the enclosing <Canvas> came from `@react-three/fiber` (web) or
// `@react-three/fiber/native` (native) — both are the same underlying
// `three` scene graph.
//
// Placeholder geometry: each muscle region renders as its own box at the
// position/size defined in ../muscleRegions.ts, standing in for the
// licensed mesh (see docs/licensing/3d-mesh-license.md) until it is
// vendored. Swapping in the real mesh later only touches this file (adding
// a loaded model plus keeping these boxes as invisible hit-volumes), not
// the adapters or the interaction contract.

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useCallback } from 'react';
import * as THREE from 'three';

import { cameraStateToFraming, type InteractionState } from '../interactionContract';
import { MUSCLE_REGIONS } from '../muscleRegions';

function CameraRig({ cameraState }: { cameraState: InteractionState['camera'] }) {
  useFrame(({ camera }) => {
    const framing = cameraStateToFraming(cameraState);
    const spherical = new THREE.Spherical(
      framing.distance,
      framing.polarRadians,
      framing.azimuthRadians,
    );
    camera.position.setFromSpherical(spherical);
    camera.lookAt(0, 1, 0);
  });
  return null;
}

interface RegionMeshProps {
  center: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
  selected: boolean;
  onPointerUp: (point: [number, number, number]) => void;
}

function RegionMesh({ center, halfExtents, selected, onPointerUp }: RegionMeshProps) {
  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onPointerUp([event.point.x, event.point.y, event.point.z]);
    },
    [onPointerUp],
  );

  return (
    <mesh position={center as unknown as [number, number, number]} onPointerUp={handlePointerUp}>
      <boxGeometry args={[halfExtents[0] * 2, halfExtents[1] * 2, halfExtents[2] * 2]} />
      <meshStandardMaterial color={selected ? '#e08a2b' : '#8899aa'} />
    </mesh>
  );
}

export interface BodyModelSceneProps {
  state: InteractionState;
  onRegionPointerUp: (point: [number, number, number]) => void;
}

export default function BodyModelScene({ state, onRegionPointerUp }: BodyModelSceneProps) {
  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight position={[2, 4, 3]} intensity={0.6} />
      <CameraRig cameraState={state.camera} />
      {MUSCLE_REGIONS.map((region) => (
        <RegionMesh
          key={region.id}
          center={region.center}
          halfExtents={region.halfExtents}
          selected={state.selection.regionId === region.id}
          onPointerUp={onRegionPointerUp}
        />
      ))}
    </>
  );
}
