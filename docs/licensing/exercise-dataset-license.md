# Exercise dataset licensing — go/no-go record (Phase 0.5, retroactive)

**Status: signed off.** This is the Phase 0.5 checkpoint plan.md requires before
Phase 3 may begin implementation against an exercise dataset. It was not
performed when Phase 0.5 was originally defined; it is performed now, as a
prerequisite, before Phase 3 content work proceeds.

## Dataset

- **Source**: [`yuhonas/free-exercise-db`](https://github.com/yuhonas/free-exercise-db)
  (Free Exercise DB), retrieved directly from
  `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`
  on 2026-09-29.
- **Size**: 876 exercises, verified by direct inspection of the downloaded file
  (not a secondhand claim) — see `/data/exercises/source/exercises.json`.
- **Provenance**: restructured by the repository's maintainer from
  [`wrkout/exercises.json`](https://github.com/wrkout/exercises.json), per the
  repository's own README "Special Thanks" section.

## License

- **License**: Unlicense (public-domain dedication), confirmed by fetching the
  actual `LICENSE.md` file from the repository — see
  `/data/exercises/source/LICENSE.md` for the full text as retrieved.
- **Commercial/use license**: ✅ explicitly permitted — "Anyone is free to
  copy, modify, publish, use, compile, sell, or distribute this software... for
  any purpose, commercial or non-commercial."
- **Redistribution rules**: ✅ no restriction — the Unlicense places the work in
  the public domain with no conditions.
- **Attribution requirements**: none required by the license. As a courtesy,
  the upstream source chain (`yuhonas/free-exercise-db`, originally derived
  from `wrkout/exercises.json`) is recorded here and in
  `/data/exercises/source/`.
- **Offline/local storage permission**: ✅ — nothing in the Unlicense
  restricts copying/storing the data; it is vendored into this repo at
  `/data/exercises/source/exercises.json` and re-tagged into our own schema,
  matching DR-1 ("does not depend on that dataset being queried live at
  runtime").
- **API usage restrictions**: N/A — this is a static dataset fetched once at
  import time (a GitHub-hosted raw file), not a live API with rate limits or
  usage terms. It is not queried at app runtime.
- **Dataset maintenance strategy**: manual re-import. Re-run
  `/data/exercises/scripts/importAndTag.ts` against a fresh download of the
  upstream file when corrections or additions are needed; the script and
  generated seed are idempotent (see that file's header comment). No fixed
  cadence is set for V1 — owner is whoever maintains the exercise content
  pipeline (unassigned as of this writing; flag for product decision, same as
  other unassigned-owner items in plan.md).

## Sign-off

Go. Phase 3 may proceed against this dataset. Only exercise *metadata*
(name, instructions text, muscle/equipment/difficulty tags) is imported —
the dataset's exercise images are **not** imported or hosted, since no
schema column exists for them and no in-scope requirement (spec.md FR-4.x,
FR-2.x) calls for exercise imagery in V1.
