// Asset check for the vendored mesh against ../src/muscleRegions.ts: loads
// assets/body-model.glb, normalizes it with the same
// src/shared/meshNormalization.ts the app uses, and reports each region
// mesh's vertex count and the model's overall size. Run after rebuilding
// the mesh (scripts/buildAnatomyMesh.py) or changing the region list:
//
//   npx tsx packages/three-model/scripts/checkRegionCoverage.ts
//
// Exits non-zero if a region has no mesh (its highlight would be invisible
// and it could never be tapped) or a `region-` mesh names an unknown region.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { REGION_MESH_PREFIX, regionIdFromMeshName } from '../src/interactionContract';
import { MUSCLE_REGION_IDS } from '../src/muscleRegions';
import { normalizeBodyScene } from '../src/shared/meshNormalization';

const glbPath = path.resolve(__dirname, '../assets/body-model.glb');
const buffer = readFileSync(glbPath);

new GLTFLoader().parse(
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  '',
  (gltf) => {
    const scene = normalizeBodyScene(gltf.scene);
    const verticesByRegion = new Map<string, number>();
    const unknown: string[] = [];
    let total = 0;
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const count = mesh.geometry.attributes.position.count;
      total += count;
      const regionId = regionIdFromMeshName(mesh.name, MUSCLE_REGION_IDS);
      if (regionId) verticesByRegion.set(regionId, (verticesByRegion.get(regionId) ?? 0) + count);
      else if (mesh.name.startsWith(REGION_MESH_PREFIX)) unknown.push(mesh.name);
      else console.log(`     ${mesh.name.padEnd(14)} ${String(count).padStart(6)} vertices (not selectable)`);
    });

    let failed = unknown.length > 0;
    for (const regionId of MUSCLE_REGION_IDS) {
      const count = verticesByRegion.get(regionId) ?? 0;
      failed ||= count === 0;
      console.log(`${count > 0 ? 'ok  ' : 'MISS'} ${regionId.padEnd(14)} ${String(count).padStart(6)} vertices`);
    }
    for (const name of unknown) console.log(`UNKNOWN region mesh ${name}`);
    console.log(`${total} vertices in total`);
    process.exit(failed ? 1 : 0);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
