# 3D body mesh licensing — go/no-go record (Phase 0.5, for Phase 4)

**Superseded (2026-11-01):** the app now ships the Z-Anatomy anatomical mesh;
see `/docs/licensing/anatomical-mesh-license.md`. This record is kept for history.

**Status: GO.** This is the Phase 0.5 checkpoint plan.md requires before Phase 4
may begin implementation against a 3D mesh asset — completed now, as a
prerequisite, before Phase 4 engineering proceeds.

## Source

- **Primary choice**: Adobe **Mixamo** (`mixamo.com`) default base character
  ("Y Bot" / "X Bot") — a free, rigged, low-poly humanoid mesh, the most
  widely used free real-time human base mesh in commercial game/app
  development, distributed by Adobe.
- **Fallback source** (if Mixamo's account-gated download proves
  impractical): the CC0 humanoid collection on
  [OpenGameArt.org](https://opengameart.org/content/3d-humanoids-under-cc0),
  which includes explicitly "mobile ready" / low-poly / rigged options,
  confirmed CC0 (true public domain), downloadable without an account.
- **Fallback of last resort** (if no 3D asset proves workable once real
  device performance is measured): the static, image-based 2D muscle map
  already recorded as ADR-3's contingency in `plan.md` — unchanged by this
  record, just cross-referenced here.

## License

**Mixamo (primary choice):**
- **Commercial use rights**: ✅ Adobe's Mixamo terms permit free use of
  characters and animations "for personal, commercial, and non-profit
  projects," explicitly including games and other applications.
- **Redistribution rights**: ✅ for our use case, with one specific
  restriction — characters/animations may not be redistributed as
  **standalone raw asset files** (e.g., packaged and resold as a character
  pack on another asset store). Compiling the mesh into our own app's asset
  bundle (web) or app binary (native) — where end users consume the app, not
  the raw mesh file — is exactly the use case the license is written to
  permit, not the restricted one.
- **Attribution requirements**: none. Adobe's Mixamo terms do not require
  attribution for use of characters/animations.
- **Modification permitted**: ✅ explicitly — re-rigging, retexturing, and
  custom modification for a project is standard, expected Mixamo usage.
- **Bundled in both web and native apps**: ✅ both qualify as "incorporated
  into a project" under the license; neither is "distributing the raw
  character/animation files" as a standalone product.

**OpenGameArt CC0 fallback:**
- True public domain (CC0) — no restriction on commercial use, redistribution,
  modification, or bundling; no attribution required. Strictly more
  permissive than Mixamo's terms, at the cost of a less
  widely-battle-tested/recognized source.

## Expected file format

Mixamo exports FBX (skinned or unskinned), OBJ, or Collada (`.dae`) directly
from `mixamo.com` — it does not export glTF/GLB natively. The standard,
well-documented conversion path (Blender import/export, or the `FBX2glTF`
CLI) produces a `.glb` (binary glTF) file, which is the actual runtime format
this app will bundle and load: glTF/GLB is the format both `three.js`
(`GLTFLoader`, used by the web `@react-three/fiber` renderer) and
`expo-three`/`expo-gl` (native renderer) are built to consume efficiently.

## Expected file size / performance implications

Mixamo base characters are typically in the 15,000–30,000 triangle range
with a single diffuse/normal material set; a converted, texture-compressed
GLB is typically 1–5 MB. This is well within real-time rendering budgets for
both a WebGL canvas (web) and `expo-gl` (native, mid-range Android
included), and consistent with NFR-2's "load and become interactive within a
few seconds" target — though that target itself still requires the real
device measurement already tracked in
`docs/deferred-production-checks.md` (Android/iOS runtime verification),
since no device is available in this development environment to confirm it
empirically.

## What this sandbox could and couldn't verify directly

Both Mixamo and Sketchfab (an initially-considered alternative, a CC-BY
muscular-anatomy model by CharacterZone, also confirmed commercially usable
but requiring per-mesh attribution and an account-gated download) require a
free account login to actually download the binary asset. Phase 3's exercise
dataset was fetchable via a plain unauthenticated URL and was directly
downloaded and inspected as part of that phase's licensing sign-off; this
asset is not similarly fetchable in this sandbox (no credentials, and
creating an Adobe/Sketchfab account is not this agent's call to make). This
record verifies and documents the **license terms** (public Mixamo FAQ/terms
research, not a secondhand claim), but the **binary mesh file itself has not
been downloaded or vendored** into this repository.

**Consequence for Phase 4 engineering**: implementation proceeds against a
placeholder primitive geometry (simple boxes/capsules positioned at the same
coordinates as the real muscle-region volumes) standing in for the licensed
mesh, so the interaction contract, adapters, and parity tests can be built
and verified now without blocking on a manual, credentialed download step.
Swapping in the real Mixamo-derived GLB later is a localized asset-loading
change (see `packages/three-model/src/web/BodyModel.web.tsx` and
`.../native/BodyModel.native.tsx`), not a rewrite, because both adapters load
"the body mesh" through one narrow loading call already isolated for this
purpose.

**Tracked as a follow-up** (added to `docs/deferred-production-checks.md`):
someone with a Mixamo/Adobe account must download the "Y Bot" or "X Bot"
character, convert it to `.glb`, and commit it to
`packages/three-model/assets/`, replacing the placeholder geometry, before
this feature is production-ready.

## Sign-off

**GO.** Mixamo's base character is approved as the primary 3D mesh source
for Phase 4 and beyond, on the license terms recorded above. Phase 4
implementation may proceed using placeholder geometry pending the manual
asset-acquisition follow-up tracked in `docs/deferred-production-checks.md`.
