import type { InteractionState } from './interactionContract';

export interface BodyModelProps {
  onSelectionChange?: (regionId: string | null) => void;
  /** Test/debug escape hatch: fires on every state change, not just selection. */
  onInteractionStateChange?: (state: InteractionState) => void;
}

/** Imperative handle so a screen can provide one cross-platform "Reset view" control regardless of which adapter is mounted. */
export interface BodyModelHandle {
  reset: () => void;
}
