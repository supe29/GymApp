# Anatomical muscle mesh — licensing options (research, not a sign-off)

**Status: decided 2026-11-01 — the owner chose Z-Anatomy.** See
`/docs/licensing/anatomical-mesh-license.md` for the go/no-go record; the
research below is kept as the record of alternatives. (Originally: the
Mixamo base character, `/docs/licensing/3d-mesh-license.md`, stayed in place.) Replacing it with a mesh that shows individual muscles is a
new external asset and needs its own Phase 0.5 go/no-go before any work
builds on it. Researched 2026-10-31 from public pages; license terms below
must be re-read at the source before sign-off.

## Candidates

| Option | License | Download | Fit for this app | Main concern |
|---|---|---|---|---|
| **Z-Anatomy** (GitHub: `Z-Anatomy/Models-of-human-anatomy`) | CC BY-SA 4.0 | `.blend` / FBX, no account | Anatomically exact, every muscle a separate object; static (not rigged); very heavy, needs the muscle layer extracted and decimated | **Share-alike**: the modified mesh must be offered under CC BY-SA, with attribution. A few bundled sub-models are CC BY-NC-SA (e.g. inner ear) and must be excluded |
| **BodyParts3D** (DBCLS) | CC BY-SA 2.1 Japan | OBJ zips (127 MB / 521 MB), no account | Medical-grade separate muscles by organ ID; static; needs assembly and heavy decimation | Share-alike, as above; an older release README mentions an "additional license" for derivatives — confirm with DBCLS which terms apply |
| **Sketchfab "CC Attribution" muscular basemeshes** (e.g. "Practice muscular man anatomy study", "Bodybuilder man anatomy practice basemesh") | CC BY 4.0 (per listing) | Free Sketchfab account required | Sculpted muscular figure, usually one surface (muscles visible, not separated) — region painting as today still needed | Attribution only (no share-alike); quality and license must be checked per model; account-gated download is the owner's to do |
| **Paid royalty-free ecorché** (e.g. CGTrader "Rigged muscle anatomy … bodybuilder", ~$10, glTF) | Marketplace royalty-free license | Purchase + account | Often rigged with separated muscles; ready for real-time | Costs money; marketplace license must be read for app-bundling terms; the purchase is the owner's to make |

## Engineering impact (any option)

- A mesh with **separate muscle objects** would let regions come from object
  names instead of calibrated boxes (`muscleRegions.ts`): exact boundaries,
  no calibration drift. The contract's region IDs and selection semantics
  stay the same; only how a tapped vertex maps to a region changes.
- A **single-surface** sculpt keeps today's pipeline: recalibrate the boxes
  and re-run `packages/three-model/scripts/checkRegionCoverage.ts`.
- Any candidate must be decimated to the existing budget (NFR-2; current
  mesh ≈ 35k vertices) and converted to `.glb`.

## Recommendation

If share-alike is acceptable to the owner (it applies to the mesh file, and
attribution must be shown in the app), **Z-Anatomy** gives the best result
at no cost and with no account. If share-alike is not acceptable, a
**paid royalty-free rigged ecorché** is the most practical route, with a
CC BY Sketchfab sculpt as the free fallback.

## Sources

- Z-Anatomy: https://github.com/Z-Anatomy/Models-of-human-anatomy , https://github.com/LluisV/Z-Anatomy
- BodyParts3D license/README: https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/README_e.html
- Sketchfab: https://sketchfab.com/3d-models/practice-muscular-man-anatomy-study-90a65453592b40b6b3e90f0685e5ba7d , https://sketchfab.com/3d-models/bodybuilder-man-anatomy-practice-basemesh-67f60a34b71e497ead72645e8c5e9151
- CGTrader: https://www.cgtrader.com/3d-models/character/human-anatomy/rigged-muscle-anatomy-skeleton-muscles-bodybuilder-anatomy
