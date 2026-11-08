import { defaultInteractionState, type InteractionState, type RegionId } from '../interactionContract';

/** The demo figure has nothing to select. */
export const DEMO_REGION_IDS: readonly RegionId[] = [];

/** Starts turned about 35 degrees, since most movements read poorly from straight on. */
const DEMO_INITIAL_YAW = 0.1;

export function demoInitialState(): InteractionState {
  const state = defaultInteractionState();
  return { ...state, camera: { ...state.camera, yaw: DEMO_INITIAL_YAW } };
}
