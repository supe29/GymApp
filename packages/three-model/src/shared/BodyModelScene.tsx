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
// Real mesh: the vendored Mixamo-derived body (see
// docs/licensing/3d-mesh-license.md, packages/three-model/assets/body-model.glb)
// renders via BodyMesh below. The per-region boxes defined in
// ../muscleRegions.ts remain, but only as invisible (opacity 0) hit-volumes
// for raycasting/selection — `transparent` meshes still participate in
// three.js raycasting, only `visible: false` ones don't — with a
// translucent highlight shown over the real mesh when a region is selected.
// Resolved identically on web and native through expo-asset (works on both
// platforms), which is why this file stays platform-agnostic.

import { useLoader, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Asset } from 'expo-asset';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { cameraStateToFraming, type InteractionState } from '../interactionContract';
import { MUSCLE_REGIONS } from '../muscleRegions';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BODY_MODEL_ASSET = require('../../assets/body-model.glb');

// Region boxes assume a standing figure with feet at y=0, head at y≈1.9
// (see ../muscleRegions.ts) — the vendored mesh is normalized to that same
// frame regardless of its raw export scale/pivot, so it isn't tied to
// Mixamo's particular export units.
const TARGET_HEIGHT = 1.9;

function useBodyModelUri(): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const asset = Asset.fromModule(BODY_MODEL_ASSET);
    asset.downloadAsync().then(() => {
      if (!cancelled) setUri(asset.localUri ?? asset.uri);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return uri;
}

function BodyMeshLoader({ uri }: { uri: string }) {
  const gltf = useLoader(GLTFLoader, uri);
  const normalized = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const rawBox = new THREE.Box3().setFromObject(scene);
    const rawHeight = rawBox.max.y - rawBox.min.y;
    const scale = rawHeight > 0 ? TARGET_HEIGHT / rawHeight : 1;
    scene.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(scene);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);
    scene.position.x -= scaledCenter.x;
    scene.position.z -= scaledCenter.z;
    scene.position.y -= scaledBox.min.y;
    return scene;
  }, [gltf]);

  return <primitive object={normalized} />;
}

function BodyMesh() {
  const uri = useBodyModelUri();
  if (!uri) return null;
  return (
    <Suspense fallback={null}>
      <BodyMeshLoader uri={uri} />
    </Suspense>
  );
}

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
      <meshStandardMaterial
        color="#e08a2b"
        transparent
        opacity={selected ? 0.35 : 0}
        depthWrite={false}
      />
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
      <BodyMesh />
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
