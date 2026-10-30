# OQ-2: Muscle-group taxonomy for the 3D model and exercise tagging

**Status:** Resolved in Phase 3. This question was already answered in the code (`supabase/migrations/0002_equipment_and_muscle_taxonomy.sql` and `supabase/seed/exercises_seed.sql`) but, unlike OQ-1/3/4/6/11, never got a standalone decision record. Written retroactively during Phase 13's final open-question pass so the resolution is recorded, not just implied by a migration comment.

## Decision

The muscle-group taxonomy is a **fixed, 17-entry list**, matching A-4's "~15-20 groups, app-defined, not user-configurable":

`abdominals`, `abductors`, `adductors`, `biceps`, `calves`, `chest`, `forearms`, `glutes`, `hamstrings`, `lats`, `lower_back`, `middle_back`, `neck`, `quadriceps`, `shoulders`, `traps`, `triceps`.

This list is the single source of truth consumed by both the 3D model's region IDs (`packages/three-model/src/interactionContract.ts`) and exercise tagging (`exercise_muscles` table, seeded from `supabase/seed/exercises_seed.sql`).

## Rationale

- **Why 17, not a rounder 15 or 20?** The list is derived directly from the licensed exercise dataset's own muscle vocabulary (`yuhonas/free-exercise-db`, per `docs/licensing/exercise-dataset-license.md`) rather than invented independently, so every seeded exercise's primary/secondary muscle tags map onto it without a lossy re-bucketing step. 17 is simply the count of distinct muscle terms that dataset actually uses.
- **Why fixed, not user-configurable?** Per A-4 and NFR-6, the taxonomy is structural (it is the join key between the 3D model's regions and the content database), not content — letting users edit it would require migrating every existing `exercise_muscles` row and every 3D region mapping per edit, with no corresponding user value identified in `intent.md`.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Hand-curated ~15-group list, independent of the dataset's vocabulary | Would require a many-to-one remapping of every exercise's muscle tags from the dataset's native terms, adding curation risk (R-2) for no accuracy gain. |
| Finer-grained taxonomy (e.g. splitting "chest" into upper/mid/lower) | Dataset doesn't tag at that resolution; would require inferring finer tags with no reliable source, and the 3D mesh's region granularity (Phase 4) wasn't scoped for it. |

## Consequences

- `packages/three-model/src/interactionContract.ts`'s region IDs and `exercise_muscles.muscle_group` are both constrained to this exact 17-value set; adding a region later means updating the taxonomy in both places plus a content re-tagging pass, not a config change.
- `plan.md`'s Unresolved Questions table's OQ-2 row is marked resolved, pointing here.
