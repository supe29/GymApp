// Phase 4 shared entry point. Metro (the app's real bundler) resolves
// `./BodyModel.web`/`./BodyModel.native` directly for a bundled app —
// platform-suffixed files take priority over this one, so this dispatcher
// never actually runs inside the built app. It exists for consumers that
// don't go through Metro's platform-extension resolution algorithm (Jest,
// ts-node, any plain Node tooling), so `import { BodyModel } from
// 'three-model'` resolves to a real implementation everywhere, not just
// inside Expo's bundler.
//
// Not imported by this package's own test suite (packages/three-model/src/
// __tests__) — those test the platform-agnostic interactionContract and
// gestureMath modules directly, deliberately avoiding a `react-native`
// import chain that plain ts-jest (unlike Metro or jest-expo) cannot
// transform.
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { Platform } from 'react-native';

import type { BodyModelHandle, BodyModelProps } from './BodyModelTypes';

type BodyModelComponent = ForwardRefExoticComponent<
  BodyModelProps & RefAttributes<BodyModelHandle>
>;

// Synchronous, platform-branching require is the deliberate choice here —
// this component must resolve immediately (no lazy/async loading), and
// this is the standard pattern for this kind of manual platform dispatch.
/* eslint-disable @typescript-eslint/no-require-imports */
const BodyModel: BodyModelComponent =
  Platform.OS === 'web'
    ? (require('./web/BodyModel.web').default as BodyModelComponent)
    : (require('./native/BodyModel.native').default as BodyModelComponent);
/* eslint-enable @typescript-eslint/no-require-imports */

export default BodyModel;
