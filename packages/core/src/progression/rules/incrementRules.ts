// Phase 8: progressive-overload increment magnitudes (spec.md OQ-3,
// resolved — see /docs/decisions/OQ-3-progression-increment-rule.md).
// Plain constants rather than a lookup table: spec.md's own framing
// ("a fixed conservative weight/rep increment") calls for exactly this,
// not a goal/level-differentiated rule set.

/** SR-4: the smallest common plate increment — conservative by construction. */
export const WEIGHT_INCREMENT_KG = 2.5;

/** The rep-target nudge used both for bodyweight full-success and partial-success cases. */
export const REP_INCREMENT = 1;
