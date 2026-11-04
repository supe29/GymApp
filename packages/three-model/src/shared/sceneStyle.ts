// Look of the anatomy shared by the main body model and the exercise demo
// figure: display colors, per-mesh materials and the exercise highlight.
// Asset URI resolution lives here too, since both scenes load a .glb the
// same way on web and native (expo-asset).

import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import * as THREE from 'three';

import { regionIdFromMeshName } from '../interactionContract';
import { MUSCLE_REGION_IDS } from '../muscleRegions';
import { PRIMARY_PEAK_OPACITY, pulseOpacity } from '../pulseAnimation';

/** Neutral display colors: selectable muscles, other (not selectable) muscles, skeleton. */
export const REGION_BASE_COLOR = new THREE.Color('#bcc3cb');
const CONTEXT_MUSCLE_COLOR = new THREE.Color('#a4abb4');
const BONE_COLOR = new THREE.Color('#e3ddd0');
/** Selected/hovered regions and an active exercise's primary muscles. */
export const PRIMARY_COLOR = new THREE.Color('#e0442f');
/** An active exercise's secondary muscles. */
export const SECONDARY_COLOR = new THREE.Color('#f0a33a');
/** A pulsing region's tint swings between these, so targeted muscles never fade out completely. */
const PULSE_MIN_TINT = 0.45;
const PULSE_MAX_TINT = 1;

export function useAssetUri(assetModule: number): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const asset = Asset.fromModule(assetModule);
    asset.downloadAsync().then(() => {
      if (!cancelled) setUri(asset.localUri ?? asset.uri);
    });
    return () => {
      cancelled = true;
    };
  }, [assetModule]);
  return uri;
}

/**
 * Gives every mesh its own material in its display color, and returns the
 * materials of region meshes indexed like MUSCLE_REGION_IDS (null where
 * the asset has no mesh for a region; checkRegionCoverage guards that).
 */
export function prepareMaterials(root: THREE.Object3D): (THREE.MeshStandardMaterial | null)[] {
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

/**
 * Signed highlight strength of a region targeted by an exercise, from its
 * regionPulsePeakOpacity: positive uses PRIMARY_COLOR, negative
 * SECONDARY_COLOR, 0 means not targeted.
 */
export function exerciseTint(elapsedSeconds: number, peak: number): number {
  if (peak <= 0) return 0;
  const wave = pulseOpacity(elapsedSeconds, peak) / peak;
  const strength = PULSE_MIN_TINT + (PULSE_MAX_TINT - PULSE_MIN_TINT) * wave;
  return peak === PRIMARY_PEAK_OPACITY ? strength : -strength;
}

/** Sets a region material's color from a signed tint (see exerciseTint). */
export function applyTint(material: THREE.MeshStandardMaterial, tint: number): void {
  material.color.copy(REGION_BASE_COLOR).lerp(tint < 0 ? SECONDARY_COLOR : PRIMARY_COLOR, Math.abs(tint));
}
