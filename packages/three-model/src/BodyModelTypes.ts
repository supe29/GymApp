import type { InteractionState, ModelSide } from './interactionContract';

export interface BodyModelProps {
  onSelectionChange?: (regionId: string | null) => void;
  /** Test/debug escape hatch: fires on every state change, not just selection. */
  onInteractionStateChange?: (state: InteractionState) => void;
  /**
   * Muscle-group keys (RegionId) targeted by whichever exercise is
   * currently "active" in the caller (e.g. tapped in MuscleExplorerScreen's
   * filtered list) — their regions pulse on the model. `null`/`undefined`
   * means no exercise is active, no pulsing. Bypasses interactionReducer
   * entirely: this isn't a camera/selection gesture on the 3D view, it's
   * driven by state external to this component.
   */
  activeExerciseMuscles?: { primary: readonly string[]; secondary: readonly string[] } | null;
}

export interface DemoFigureProps {
  /** Movement-pattern clip to play; `null` stands the figure in its rest pose. */
  clip: string | null;
  /** Muscle-group keys to highlight, as in BodyModelProps.activeExerciseMuscles. */
  muscles?: { primary: readonly string[]; secondary: readonly string[] } | null;
  paused?: boolean;
  /** Holds the clip at this point of the rep (0 to 1) instead of playing it (reduced motion). */
  holdPhase?: number | null;
}

/** Imperative handle so a screen can provide one cross-platform "Reset view" control regardless of which adapter is mounted. */
export interface BodyModelHandle {
  reset: () => void;
  /** Turns the model to show its front or back (keeps zoom and selection). */
  showSide: (side: ModelSide) => void;
}
