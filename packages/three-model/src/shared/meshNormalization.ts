// Normalizes the vendored body mesh into the model-local frame the camera
// framing (../interactionContract.ts CAMERA_*_DISTANCE, BodyModelScene's
// CameraRig) is tuned for: feet at y=0, head top at y=1.9, centered on
// x/z, facing +z, standing in the anatomical position (arms at the sides).
// Pure three.js (no React, no expo), so the scene and the asset check
// script (../../scripts/checkRegionCoverage.ts) share the same transform.

import * as THREE from 'three';

export const TARGET_HEIGHT = 1.9;

/** A normalized copy of the loaded glTF scene (the static, unrigged anatomical mesh). */
export function normalizeBodyScene(source: THREE.Object3D): THREE.Object3D {
  const scene = source.clone();
  scene.updateMatrixWorld(true);
  const rawBox = new THREE.Box3().setFromObject(scene, true);
  const rawHeight = rawBox.max.y - rawBox.min.y;
  scene.scale.setScalar(rawHeight > 0 ? TARGET_HEIGHT / rawHeight : 1);
  scene.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(scene, true);
  const center = scaledBox.getCenter(new THREE.Vector3());
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= scaledBox.min.y;
  scene.updateMatrixWorld(true);
  return scene;
}
