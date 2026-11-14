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
import { Suspense, useCallback, useMemo, useRef } from 'react';
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
import { regionHeatmapTint } from '../heatmap';
import {
  facingShares,
  isFacingCamera,
  layoutRegionLabels,
  regionAnchorFromPositions,
  sameLabelLayout,
  sectionCentre,
  type LabelCandidate,
  type PlacedLabel,
  type Point3,
} from '../regionLabels';
import { regionPulsePeakOpacity } from '../pulseAnimation';
import { TARGET_HEIGHT, normalizeBodyScene } from './meshNormalization';
import { applyTint, exerciseTint, prepareMaterials, useAssetUri } from './sceneStyle';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BODY_MODEL_ASSET = require('../../assets/body-model.glb');

/** Tint strength for a selected region (0 = base color, 1 = full highlight). */
const SELECTED_TINT = 0.9;
/** Tint strength for a region under the mouse (web only; touch has no hover). */
const HOVER_TINT = 0.35;
/** Pointer travel (px) between press and release beyond which a release ends a drag rather than tapping. */
const TAP_MAX_TRAVEL_PX = 8;

interface BodyMeshProps {
  selectedRegionId: string | null;
  activeExerciseMuscles?: BodyModelProps['activeExerciseMuscles'];
  regionIntensity?: BodyModelProps['regionIntensity'];
  regionLabels?: BodyModelProps['regionLabels'];
  onLabelLayout?: (labels: PlacedLabel[]) => void;
  onRegionTap: (regionId: RegionId | null) => void;
}

interface RegionAnchor {
  point: Point3;
  /** How much of the region each view direction sees, for the facing test. */
  shares: number[];
}

/**
 * Label anchor (world space of the normalized scene) of every region mesh,
 * with its section centre (see ../regionLabels.ts). Computed once per
 * loaded model.
 */
function regionAnchors(root: THREE.Object3D): Map<string, RegionAnchor> {
  const vertex = new THREE.Vector3();
  const regionPositions = new Map<string, Float32Array>();
  const bodyLeft: number[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const attribute = mesh.isMesh ? mesh.geometry?.getAttribute('position') : undefined;
    if (!attribute) return;
    const world = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++) {
      vertex.fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld);
      world[i * 3] = vertex.x;
      world[i * 3 + 1] = vertex.y;
      world[i * 3 + 2] = vertex.z;
      // Muscles only: the skeleton sits deeper than the surface the labels mark.
      if (mesh.name !== 'bone' && vertex.x >= 0) bodyLeft.push(vertex.x, vertex.y, vertex.z);
    }
    const regionId = regionIdFromMeshName(mesh.name, MUSCLE_REGION_IDS);
    if (regionId) regionPositions.set(regionId, world);
  });
  const anchors = new Map<string, RegionAnchor>();
  for (const [regionId, positions] of regionPositions) {
    const point = regionAnchorFromPositions(positions);
    if (!point) continue;
    const centre = sectionCentre(bodyLeft, point) ?? { x: point.x, z: point.z };
    anchors.set(regionId, { point, shares: facingShares(positions, centre) });
  }
  return anchors;
}

function BodyMeshLoader({
  uri,
  selectedRegionId,
  activeExerciseMuscles,
  regionIntensity,
  regionLabels,
  onLabelLayout,
  onRegionTap,
}: BodyMeshProps & { uri: string }) {
  const gltf = useLoader(GLTFLoader, uri);
  const { scene, regionMaterials } = useMemo(() => {
    const normalized = normalizeBodyScene(gltf.scene);
    return { scene: normalized, regionMaterials: prepareMaterials(normalized) };
  }, [gltf]);
  const anchors = useMemo(() => regionAnchors(scene), [scene]);

  const peakByRegion = useMemo(
    () => MUSCLE_REGION_IDS.map((id) => regionPulsePeakOpacity(id, activeExerciseMuscles)),
    [activeExerciseMuscles],
  );
  const heatByRegion = useMemo(
    () => (regionIntensity ? MUSCLE_REGION_IDS.map((id) => regionHeatmapTint(id, regionIntensity)) : null),
    [regionIntensity],
  );
  const hoveredRegionIndex = useRef(-1);

  // Imperative per-frame tinting (mirroring CameraRig below) rather than
  // React state, so a continuously-pulsing region doesn't re-render React
  // ~60 times/sec. Tints are signed: positive uses PRIMARY_COLOR, negative
  // SECONDARY_COLOR. In heatmap mode (FR-8.5) the red scale means "share of
  // planned work done", so selection and hover use SECONDARY_COLOR instead
  // of reading as extra progress.
  useFrame((frameState) => {
    MUSCLE_REGION_IDS.forEach((regionId, i) => {
      const material = regionMaterials[i];
      if (!material) return;
      if (heatByRegion) {
        let tint = heatByRegion[i];
        if (regionId === selectedRegionId) tint = -SELECTED_TINT;
        else if (i === hoveredRegionIndex.current && tint === 0) tint = -HOVER_TINT;
        applyTint(material, tint);
        return;
      }
      let tint = exerciseTint(frameState.clock.elapsedTime, peakByRegion[i]);
      if (regionId === selectedRegionId) tint = Math.max(tint, SELECTED_TINT);
      else if (i === hoveredRegionIndex.current && tint === 0) tint = HOVER_TINT;
      applyTint(material, tint);
    });
  });

  // FR-8.5 on-model numbers: project each labelled region's anchor to
  // screen pixels and hand the layout to the adapter's overlay, only when it
  // actually changed (the camera moves on gestures, not every frame).
  const lastLayout = useRef<PlacedLabel[]>([]);
  const projected = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    if (!onLabelLayout) return;
    let next: PlacedLabel[] = [];
    if (regionLabels) {
      camera.updateMatrixWorld();
      const candidates: LabelCandidate[] = [];
      for (const [regionId, text] of Object.entries(regionLabels)) {
        const anchor = anchors.get(regionId);
        if (!anchor) continue;
        // The body-left anchor and its mirror on the body's right side.
        const screenAnchors = [1, -1].map((mirror) => {
          const point = { ...anchor.point, x: anchor.point.x * mirror };
          projected.set(point.x, point.y, point.z).project(camera);
          return {
            x: ((projected.x + 1) / 2) * size.width,
            y: ((1 - projected.y) / 2) * size.height,
            facing: projected.z < 1 && isFacingCamera(anchor.shares, point, camera.position, mirror < 0),
          };
        });
        candidates.push({ regionId, text, anchors: screenAnchors });
      }
      next = layoutRegionLabels(candidates, size, selectedRegionId);
    }
    if (sameLabelLayout(next, lastLayout.current)) return;
    lastLayout.current = next;
    onLabelLayout(next);
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
  const uri = useAssetUri(BODY_MODEL_ASSET);
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
  regionIntensity?: BodyModelProps['regionIntensity'];
  regionLabels?: BodyModelProps['regionLabels'];
  /** Receives the on-model label layout whenever it changes (see ../regionLabels.ts). */
  onLabelLayout?: (labels: PlacedLabel[]) => void;
}

export default function BodyModelScene({
  state,
  onRegionTap,
  activeExerciseMuscles,
  regionIntensity,
  regionLabels,
  onLabelLayout,
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
        regionIntensity={regionIntensity}
        regionLabels={regionLabels}
        onLabelLayout={onLabelLayout}
        onRegionTap={onRegionTap}
      />
    </>
  );
}
