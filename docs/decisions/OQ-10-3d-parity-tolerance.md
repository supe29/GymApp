# OQ-10: Numeric tolerance for 3D-renderer parity

**Status:** Resolved in Phase 4. This was already answered in code (`packages/three-model/src/interactionContract.ts:105-111`) and exercised by a passing test (`packages/three-model/src/__tests__/parity/crossRendererParity.test.ts`), but — like OQ-2 — never got a standalone decision record. Written retroactively during Phase 13's final open-question pass.

## Decision

**The tolerance is zero, at the state layer, because camera/selection math is shared code rather than two independent implementations.** Both the `@react-react/fiber` (web) and `expo-gl` (native) renderers compute camera framing, rotation, and hit-testing through the same shared `three` (`Spherical`/`Vector3`) math in `interactionContract.ts`, not platform-specific reimplementations. Given equal input state, the two platforms produce exactly equal output state — there is no "how close is close enough" numeric threshold to define, because there's nothing for the two platforms to independently drift apart on at that layer. The only remaining difference is GPU/anti-aliasing pixel-level rendering, which this contract deliberately does not attempt to measure or bound.

## Rationale

- **Why zero tolerance instead of picking a numeric epsilon?** OQ-10 as originally framed assumed two independent renderer implementations that might compute slightly different camera/rotation values and need a tolerance band to call "equivalent." That assumption turned out to be avoidable: routing both platforms' interaction math through one shared module (ADR-3's shared-contract design) eliminates the divergence at its source rather than measuring and bounding it after the fact. A tolerance band would have been the right tool for the originally-assumed problem; it's unnecessary once the problem itself is designed away.
- **Why is "we don't measure pixel-level rendering" an acceptable scope boundary?** R-7's actual risk (hit-testing, camera behavior, and selection precision silently drifting) is fully addressed by the shared-state-layer equality. Pixel-level GPU rendering differences (anti-aliasing, color precision) don't affect NFR-1's "equivalent behavior" requirement or FR-4.4's equivalence requirement — a user selecting the same muscle region gets the same selection result and camera position on both platforms, which is what those requirements actually ask for.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Define a numeric epsilon (e.g. ±0.01 radians) for camera/rotation comparison | Would have been necessary for two independently-implemented renderers, but the shared-math design (`interactionContract.ts`) makes the two platforms' state-layer output identical by construction, making an epsilon redundant. |
| Add pixel-diff screenshot comparison across platforms | Out of scope for what R-7/NFR-1 actually require (behavioral equivalence, not pixel-identical rendering); would also be brittle across different GPUs/devices for no requirement-driven benefit. |

## Consequences

- `crossRendererParity.test.ts` asserts exact equality on shared-math outputs, not an approximate-equality assertion — any future change that makes the two platforms diverge at the state layer (e.g. a platform-specific override of camera math) should fail this test immediately rather than passing within some tolerance.
- `plan.md`'s Unresolved Questions table's OQ-10 row is marked resolved, pointing here.
