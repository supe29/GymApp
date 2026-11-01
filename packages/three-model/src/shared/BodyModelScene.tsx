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
// Real mesh: the vendored anatomical body built from Z-Anatomy (see
// docs/licensing/anatomical-mesh-license.md, packages/three-model/assets/body-model.glb
// and ../../scripts/buildAnatomyMesh.py) renders via BodyMesh below. Each
// selectable region is its own mesh named `region-<id>` (both sides
// joined), so a tap resolves to the region of exactly the muscle under the
// pointer (regionIdFromMeshName), and highlighting tints that mesh's own
// material. Other muscles and the skeleton are shown but not selectable.
// The asset URI is resolved identically on web and native through expo-asset (works on both
// platforms), which is why this file stays platform-agnostic.

import { useLoader, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Asset } from 'expo-asset';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import type { BodyModelProps } from '../BodyModelTypes';
import {
  cameraStateToFraming,
  regionIdFromMeshName,
  type InteractionState,
  type RegionId,
} from '../interactionContract';
import { MUSCLE_REGION_IDS } from '../muscleRegions';
import { PRIMARY_PEAK_OPACITY, pulseOpacity, regionPulsePeakOpacity } from '../pulseAnimation';
import { TARGET_HEIGHT, normalizeBodyScene } from './meshNormalization';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BODY_MODEL_ASSET = require('../../assets/body-model.glb');

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

/** Neutral display colors: selectable muscles, other (not selectable) muscles, skeleton. */
const REGION_BASE_COLOR = new THREE.Color('#bcc3cb');
const CONTEXT_MUSCLE_COLOR = new THREE.Color('#a4abb4');
const BONE_COLOR = new THREE.Color('#e3ddd0');
/** Selected/hovered regions and an active exercise's primary muscles. */
const PRIMARY_COLOR = new THREE.Color('#e0442f');
/** An active exercise's secondary muscles. */
const SECONDARY_COLOR = new THREE.Color('#f0a33a');
/** Tint strength for a selected region (0 = base color, 1 = full highlight). */
const SELECTED_TINT = 0.9;
/** Tint strength for a region under the mouse (web only; touch has no hover). */
const HOVER_TINT = 0.35;
/** A pulsing region's tint swings between these, so targeted muscles never fade out completely. */
const PULSE_MIN_TINT = 0.45;
const PULSE_MAX_TINT = 1;
/** Pointer travel (px) between press and release beyond which a release ends a drag rather than tapping. */
const TAP_MAX_TRAVEL_PX = 8;

/**
 * Gives every mesh its own material in its display color, and returns the
 * materials of region meshes indexed like MUSCLE_REGION_IDS (null where
 * the asset has no mesh for a region; checkRegionCoverage guards that).
 */
function prepareMaterials(root: THREE.Object3D): (THREE.MeshStandardMaterial | null)[] {
  const regionMaterials: (THREE.MeshStandardMaterial | null)[] = MUSCLE_REGION_IDS.map(() => null);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const regionId = regionIdFromMeshName(mesh.name, MUSCLE_REGION_IDS);
    const isBone = mesh.name === 'bone';
    const material = new THREE.MeshStandardMaterial({
      color: regionId ? REGION_BASE_COLOR : isBone ? BONE_COLOR : CONTEXT_MUSCLE_COLOR,
      roughness: isBone ? 0.75 : 0.6,
      metalness: 0,
    });
    mesh.material = material;
    if (regionId) regionMaterials[MUSCLE_REGION_IDS.indexOf(regionId)] = material;
  });
  return regionMaterials;
}

interface BodyMeshProps {
  selectedRegionId: string | null;
  activeExerciseMuscles?: BodyModelProps['activeExerciseMuscles'];
  onRegionTap: (regionId: RegionId | null) => void;
}

function BodyMeshLoader({ uri, selectedRegionId, activeExerciseMuscles, onRegionTap }: BodyMeshProps & { uri: string }) {
  const gltf = useLoader(GLTFLoader, uri);
  const { scene, regionMaterials } = useMemo(() => {
    const normalized = normalizeBodyScene(gltf.scene);
    return { scene: normalized, regionMaterials: prepareMaterials(normalized) };
  }, [gltf]);

  const peakByRegion = useMemo(
    () => MUSCLE_REGION_IDS.map((id) => regionPulsePeakOpacity(id, activeExerciseMuscles)),
    [activeExerciseMuscles],
  );
  const hoveredRegionIndex = useRef(-1);

  // Imperative per-frame tinting (mirroring CameraRig below) rather than
  // React state, so a continuously-pulsing region doesn't re-render React
  // ~60 times/sec. Tints are signed: positive uses PRIMARY_COLOR, negative
  // SECONDARY_COLOR.
  useFrame((frameState) => {
    MUSCLE_REGION_IDS.forEach((regionId, i) => {
      const material = regionMaterials[i];
      if (!material) return;
      let tint = 0;
      const peak = peakByRegion[i];
      if (peak > 0) {
        const wave = pulseOpacity(frameState.clock.elapsedTime, peak) / peak;
        const strength = PULSE_MIN_TINT + (PULSE_MAX_TINT - PULSE_MIN_TINT) * wave;
        tint = peak === PRIMARY_PEAK_OPACITY ? strength : -strength;
      }
      if (regionId === selectedRegionId) tint = Math.max(tint, SELECTED_TINT);
      else if (i === hoveredRegionIndex.current && tint === 0) tint = HOVER_TINT;
      material.color.copy(REGION_BASE_COLOR).lerp(tint < 0 ? SECONDARY_COLOR : PRIMARY_COLOR, Math.abs(tint));
    });
  });

  const handlePointerUp = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (event.delta > TAP_MAX_TRAVEL_PX) return;
      onRegionTap(regionIdFromMeshName(event.object.name, MUSCLE_REGION_IDS));
    },
    [onRegionTap],
  );

  const handlePointerMove = useCallback((event: ThreeEvent<PointerEvent>) => {
    if (event.pointerType !== 'mouse') return;
    // The nearest hit only: muscles behind the hovered surface don't count.
    event.stopPropagation();
    const regionId = regionIdFromMeshName(event.object.name, MUSCLE_REGION_IDS);
    hoveredRegionIndex.current = regionId ? MUSCLE_REGION_IDS.indexOf(regionId) : -1;
  }, []);

  const handlePointerOut = useCallback((event: ThreeEvent<PointerEvent>) => {
    // Leaving one mesh for the next can report the leave after the next mesh's move.
    const regionId = regionIdFromMeshName(event.object.name, MUSCLE_REGION_IDS);
    if (regionId && MUSCLE_REGION_IDS.indexOf(regionId) === hoveredRegionIndex.current) {
      hoveredRegionIndex.current = -1;
    }
  }, []);

  return (
    <primitive
      object={scene}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
    />
  );
}

function BodyMesh(props: BodyMeshProps) {
  const uri = useBodyModelUri();
  if (!uri) return null;
  return (
    <Suspense fallback={null}>
      <BodyMeshLoader uri={uri} {...props} />
    </Suspense>
  );
}

/**
 * Viewport aspect (width/height) below which the posed model's width
 * no longer fits the fixed vertical FOV. Narrower (portrait phone)
 * viewports pull the camera back proportionally so the whole body stays
 * in frame; the contract's normalized zoom is unaffected.
 */
const MIN_ASPECT_FOR_FULL_WIDTH = 0.5;

/**
 * Scales the contract's camera distance so that at the default zoom the
 * body fills most of the viewport height. Applied identically on both
 * platforms (this file is shared), so parity is unaffected.
 */
const FRAMING_SCALE = 0.82;

function CameraRig({ cameraState }: { cameraState: InteractionState['camera'] }) {
  useFrame(({ camera, size }) => {
    const framing = cameraStateToFraming(cameraState);
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const spherical = new THREE.Spherical(
      framing.distance * FRAMING_SCALE * Math.max(1, MIN_ASPECT_FOR_FULL_WIDTH / aspect),
      framing.polarRadians,
      framing.azimuthRadians,
    );
    camera.position.setFromSpherical(spherical);
    // Mid-height of the normalized body (feet at 0, head top at TARGET_HEIGHT).
    camera.lookAt(0, TARGET_HEIGHT / 2, 0);
  });
  return null;
}

export interface BodyModelSceneProps {
  state: InteractionState;
  onRegionTap: (regionId: RegionId | null) => void;
  activeExerciseMuscles?: BodyModelProps['activeExerciseMuscles'];
}

export default function BodyModelScene({
  state,
  onRegionTap,
  activeExerciseMuscles,
}: BodyModelSceneProps) {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#7d838c', 1.6]} />
      <directionalLight position={[2, 4, 3]} intensity={1.6} />
      <directionalLight position={[-3, 2, -3]} intensity={0.8} />
      <CameraRig cameraState={state.camera} />
      <BodyMesh
        selectedRegionId={state.selection.regionId}
        activeExerciseMuscles={activeExerciseMuscles}
        onRegionTap={onRegionTap}
      />
    </>
  );
}
