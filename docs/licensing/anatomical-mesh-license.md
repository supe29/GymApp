# Anatomical muscle mesh — go/no-go record (Phase 0.5, for Phase 4)

**Status: GO (2026-11-01). The owner chose Z-Anatomy** from the options in
`/docs/licensing/anatomical-mesh-options.md` and accepted its share-alike
terms. This mesh replaces the Mixamo body recorded in
`/docs/licensing/3d-mesh-license.md` as `packages/three-model/assets/body-model.glb`.

## Source

- **Z-Anatomy**, "the libre 3D atlas of anatomy":
  https://github.com/Z-Anatomy/Models-of-human-anatomy , file `Z-Anatomy.zip`
  (Blender template; `Startup.blend` inside), at commit
  `a47f592731dc4056e7b9396dcde58a3586849b37`. Archive SHA-256:
  `e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736`.
  Downloaded 2026-11-01, no account needed.
- Z-Anatomy's models are derived from **BodyParts3D**, © The Database Center
  for Life Science (DBCLS), CC BY-SA 2.1 Japan.

## License

- **Z-Anatomy**: CC BY-SA 4.0 (repository `License.txt`, re-read at the
  source on 2026-11-01). Commercial use, modification and redistribution are
  permitted, provided that:
  - **Attribution**: Z-Anatomy and BodyParts3D are credited.
  - **Share-alike**: derivative works are distributed under the same
    license.
- **Excluded content**: the repository credits a few adapted sub-models
  under non-commercial terms ("Anatomy of the Inner Ear", CC BY-NC-SA 4.0;
  "Kidney", CC BY-NC 4.0). The build script uses only the muscular and
  skeletal systems, and drops the auditory ossicles. The inner ear, kidney,
  nervous system and viscera are not in the shipped mesh.

## What we ship and how we comply

- **Derivative**: `packages/three-model/assets/body-model.glb`, built by
  `packages/three-model/scripts/buildAnatomyMesh.py` (Blender, headless). The
  script picks the visible muscles and bones, groups muscles into the 17
  muscle-group regions, decimates them to about 93k vertices (about 3.3 MB),
  and exports glTF.
- **Share-alike**: the `.glb` (and the script that makes it) is offered under
  CC BY-SA 4.0. See `packages/three-model/assets/body-model.LICENSE.md`.
  This applies to the mesh file only. Share-alike does not extend to the app
  code that loads it: the app is a separate work, not an adaptation of the
  mesh.
- **Attribution in the app**: the 3D view of the Muscle Explorer shows the
  credit line "3D anatomy adapted from Z-Anatomy (CC BY-SA 4.0), based on
  BodyParts3D © DBCLS (CC BY-SA 2.1 JP)" (`MuscleExplorerScreen.tsx`,
  `muscle-explorer-model-credit`).
- **Open item, BodyParts3D terms**: an older BodyParts3D README mentions an
  additional license for derivative works. Z-Anatomy, the upstream we take
  from, distributes its derivative under CC BY-SA 4.0. Before a public store
  release, confirm with DBCLS that no further terms apply. This is tracked in
  `/docs/release-checklist.md`.

## Exercise demo figure

`packages/three-model/assets/body-demo.glb` is a further derivative: it reduces
`body-model.glb`, adds a skeleton, skin weights and plain equipment props, and
authors exercise animations (`packages/three-model/scripts/buildDemoMesh.py`).
The same terms apply. The file, animations included, is offered under CC BY-SA
4.0 (`assets/body-demo.LICENSE.md`), and the credit line must stay visible
wherever the figure is shown.

## Engineering notes

- The mesh is static (no rig) and stands in the anatomical position, arms at
  the sides. The arm-lowering pose used on the Mixamo body is gone.
- Each selectable region is its own mesh named `region-<muscle group key>`.
  The app resolves a tap from the hit mesh's name
  (`regionIdFromMeshName` in `interactionContract.ts`), so region boundaries
  are the real muscle outlines. The calibrated boxes are gone.
- The Z-Anatomy file swaps the names of the trapezius parts: its "ascending
  part" mesh is the upper band. The script maps them by geometry, and a
  comment there records this. The lumbar sheet of the latissimus mesh covers
  the erector spinae, so its triangles over the lumbar spine are assigned to
  `lower_back`.
- `npx tsx packages/three-model/scripts/checkRegionCoverage.ts` verifies
  that every region has a mesh.
- Native has not yet been run on a device: the asset is about 1.5× the size
  of the Mixamo body, so NFR-2 load time on a real phone remains a deferred
  check.
