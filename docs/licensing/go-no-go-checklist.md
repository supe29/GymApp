# Content & Asset Licensing Go/No-Go Checklist (Phase 0.5)

Per plan.md Phase 0.5: no phase may begin implementation against a given
external asset until that asset's entry here is signed off. This checklist
was not completed when Phase 0.5 was originally defined (Phases 1–2
proceeded without needing it, since neither consumes an external content
asset); it is being filled in incrementally, gated in front of whichever
phase first needs each asset.

| Asset | Consuming phase | Status | Record |
|---|---|---|---|
| Exercise dataset | Phase 3 | ✅ Signed off (2026-09-29) | `/docs/licensing/exercise-dataset-license.md` |
| 3D mesh (muscle model) | Phase 4 | ✅ Signed off — GO (2026-09-29) | `/docs/licensing/3d-mesh-license.md` |
| Food/barcode dataset(s) | Phase 9 | ⏳ Not yet needed | To be completed before Phase 9 implementation begins |

## Exercise dataset — summary

Signed off. See `/docs/licensing/exercise-dataset-license.md` for the full
record: source (`yuhonas/free-exercise-db`), license (Unlicense / public
domain, commercial use and redistribution both explicitly permitted), no
attribution required, safe to vendor/store locally, no live API dependency,
maintenance is manual re-import.

## 3D mesh — summary

Signed off, GO. See `/docs/licensing/3d-mesh-license.md` for the full record:
primary source Mixamo (Adobe) base character, license permits commercial use
and bundling into web/native apps with no attribution required (only
redistributing the *raw* asset file as a standalone product is restricted,
which does not describe embedding it in this app); fallback source an
OpenGameArt CC0 humanoid if needed; fallback-of-last-resort is ADR-3's static
2D muscle map. The binary asset itself requires a credentialed manual
download (tracked in `/docs/deferred-production-checks.md`) and was not
fetched in this sandbox; Phase 4 engineering proceeds against placeholder
geometry in the meantime.
