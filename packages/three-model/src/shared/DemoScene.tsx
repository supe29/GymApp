// The exercise demo figure's scene, shared verbatim between the web and
// native adapters like BodyModelScene. body-demo.glb (see
// ../../scripts/buildDemoMesh.py) holds a rigged figure with one animation
// clip per movement pattern; it is only downloaded once this scene mounts,
// so the explorer's first load doesn't pay for it. With no clip the figure
// stands in its rest pose and the props are hidden. A clip shrinks away the
// props it doesn't use and keys the `frame` bone with what to keep in view.

import { useFrame, useLoader } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import type { DemoFigureProps } from '../BodyModelTypes';
import { cameraStateToFraming, type CameraState } from '../interactionContract';
import { MUSCLE_REGION_IDS } from '../muscleRegions';
import { regionPulsePeakOpacity } from '../pulseAnimation';
import { TARGET_HEIGHT } from './meshNormalization';
import { applyTint, exerciseTint, prepareMaterials, useAssetUri } from './sceneStyle';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const BODY_DEMO_ASSET = require('../../assets/body-demo.glb');

const PROP_COLOR = new THREE.Color('#4a4f57');

const CAMERA_FOV_DEGREES = 45;

/** Standing height of the rest pose in the asset's own units. */
function assetBodyHeight(root: THREE.Object3D): number {
  const bone = root.getObjectByName('bone') as THREE.Mesh | undefined;
  bone?.geometry.computeBoundingBox();
  const box = bone?.geometry.boundingBox;
  return box ? box.max.y - box.min.y : TARGET_HEIGHT;
}

type FrameBoneRef = MutableRefObject<THREE.Object3D | null>;
type DemoMeshProps = Pick<DemoFigureProps, 'clip' | 'muscles' | 'paused' | 'holdPhase'> & {
  uri: string;
  frameBone: FrameBoneRef;
};

function DemoMeshLoader({ uri, clip, muscles, paused, holdPhase, frameBone }: DemoMeshProps) {
  const gltf = useLoader(GLTFLoader, uri);

  // useLoader caches the parsed file per URI, so every figure on screen gets
  // the same gltf.scene. A three.js object can only sit in one scene, and the
  // mixer and tints mutate it, so each figure works on its own clone
  // (SkeletonUtils keeps the skinned meshes bound to the cloned bones).
  // Without this, a second figure steals the mesh from the first, which goes
  // blank, and both clips drive one skeleton.
  const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf]);

  const { regionMaterials, mixer, props } = useMemo(() => {
    const materials = prepareMaterials(scene);
    const propMeshes: THREE.Object3D[] = [];
    scene.traverse((object) => {
      // Skinned bounds follow the rest pose, not the animation.
      object.frustumCulled = false;
      if (object.name.startsWith('prop-')) {
        propMeshes.push(object);
        ((object as THREE.Mesh).material as THREE.MeshStandardMaterial).color.copy(PROP_COLOR);
      }
    });
    scene.scale.setScalar(TARGET_HEIGHT / assetBodyHeight(scene));
    return { regionMaterials: materials, mixer: new THREE.AnimationMixer(scene), props: propMeshes };
  }, [scene]);

  useEffect(
    () => () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      // prepareMaterials made fresh materials for this clone; geometry stays shared with the cache.
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
      });
    },
    [mixer, scene],
  );

  const action = useMemo(() => {
    const animation = gltf.animations.find((candidate) => candidate.name === clip);
    return animation ? mixer.clipAction(animation) : null;
  }, [gltf, mixer, clip]);

  useEffect(() => {
    frameBone.current = scene.getObjectByName('frame') ?? null;
  }, [frameBone, scene]);

  useEffect(() => {
    props.forEach((prop) => {
      prop.visible = !!clip;
    });
    if (!action) {
      mixer.stopAllAction();
      return;
    }
    action.reset().play();
    return () => {
      action.stop();
    };
  }, [action, clip, mixer, props]);

  const peakByRegion = useMemo(
    () => MUSCLE_REGION_IDS.map((id) => regionPulsePeakOpacity(id, muscles)),
    [muscles],
  );

  useFrame((frameState, delta) => {
    if (action) {
      if (holdPhase !== null && holdPhase !== undefined) {
        action.time = holdPhase * action.getClip().duration;
        mixer.update(0);
      } else if (!paused) {
        mixer.update(delta);
      }
    }
    MUSCLE_REGION_IDS.forEach((_, i) => {
      const material = regionMaterials[i];
      if (material) applyTint(material, exerciseTint(frameState.clock.elapsedTime, peakByRegion[i]));
    });
  });

  return <primitive object={scene} />;
}

function DemoMesh(props: Omit<DemoMeshProps, 'uri'>) {
  const uri = useAssetUri(BODY_DEMO_ASSET);
  if (!uri) return null;
  return (
    <Suspense fallback={null}>
      <DemoMeshLoader uri={uri} {...props} />
    </Suspense>
  );
}

const framePosition = new THREE.Vector3();

function DemoCameraRig({ camera: cameraState, frameBone }: { camera: CameraState; frameBone: FrameBoneRef }) {
  useFrame(({ camera, size }) => {
    if (!frameBone.current) return;
    // Half width, height of the centre, half height (the asset's y comes out as -z here).
    frameBone.current.getWorldPosition(framePosition);
    const frameWidth = 2 * framePosition.x;
    const centerY = framePosition.y;
    const frameHeight = 2 * Math.abs(framePosition.z);
    const framing = cameraStateToFraming(cameraState);
    const aspect = size.height > 0 ? size.width / size.height : 1;
    const visibleHeightPerDistance = 2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV_DEGREES / 2));
    const distance = Math.max(frameHeight, frameWidth / aspect) / visibleHeightPerDistance;
    const offset = new THREE.Spherical(distance, framing.polarRadians, framing.azimuthRadians);
    camera.position.setFromSpherical(offset).add(new THREE.Vector3(0, centerY, 0));
    camera.lookAt(0, centerY, 0);
  });
  return null;
}

export interface DemoSceneProps extends Pick<DemoFigureProps, 'clip' | 'muscles' | 'paused' | 'holdPhase'> {
  camera: CameraState;
}

export default function DemoScene({ camera, ...meshProps }: DemoSceneProps) {
  const frameBone = useRef<THREE.Object3D | null>(null);
  return (
    <>
      <hemisphereLight args={['#ffffff', '#7d838c', 1.6]} />
      <directionalLight position={[2, 4, 3]} intensity={1.6} />
      <directionalLight position={[-3, 2, -3]} intensity={0.8} />
      <DemoCameraRig camera={camera} frameBone={frameBone} />
      <DemoMesh {...meshProps} frameBone={frameBone} />
    </>
  );
}
