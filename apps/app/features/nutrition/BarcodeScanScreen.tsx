// Phase 9 shared entry point, mirroring three-model's BodyModel.tsx
// dispatcher exactly: Metro (the app's real bundler) resolves
// `./BarcodeScanScreen.web`/`./BarcodeScanScreen.native` directly for a
// bundled app — platform-suffixed files take priority over this one, so
// this dispatcher never actually runs inside the built app. It exists for
// consumers that don't go through Metro's platform-extension resolution
// algorithm (Jest, ts-node, any plain Node tooling), so
// `import BarcodeScanScreen from './BarcodeScanScreen'` resolves to a real
// implementation everywhere, not just inside Expo's bundler.
import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import type { BarcodeScanScreenProps } from './BarcodeScanScreen.web';

// Synchronous, platform-branching require is the deliberate choice here —
// this component must resolve immediately (no lazy/async loading), the
// same pattern BodyModel.tsx uses.
/* eslint-disable @typescript-eslint/no-require-imports */
const BarcodeScanScreen: ComponentType<BarcodeScanScreenProps> =
  Platform.OS === 'web'
    ? (require('./BarcodeScanScreen.web').default as ComponentType<BarcodeScanScreenProps>)
    : (require('./BarcodeScanScreen.native').default as ComponentType<BarcodeScanScreenProps>);
/* eslint-enable @typescript-eslint/no-require-imports */

export default BarcodeScanScreen;
