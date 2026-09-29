# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state of this repository

There is no application code yet. This repository currently contains only three planning documents:

- `intent.md` — product intent: problem, target users, core UX, in/out of scope, constraints, success criteria.
- `spec.md` — the functional/non-functional specification derived from `intent.md`: numbered requirements (FR-, NFR-, DR-, UX-, PR-, SR-), user flows, acceptance criteria (AC-), and explicitly tracked assumptions/open questions (A-, OQ-).
- `plan.md` — the phased implementation plan derived from both, sequencing the build into numbered phases (Phase 0 through Phase 13) with per-phase goals, files, implementation notes, tests, acceptance criteria, and dependencies.

**Read order matters**: `plan.md` only makes sense in light of `spec.md`, and `spec.md` only makes sense in light of `intent.md`. Each document states which requirement/section of its predecessor it is satisfying (e.g. a phase in `plan.md` will cite `FR-2.x`, `SR-6`, `AC-2`). When changing one of these documents, check whether the change is consistent with the other two — `plan.md` in particular cross-references `spec.md` requirement IDs extensively, and those references break silently if either document is edited without checking the other.

There is no package manager, build tool, linter, or test runner configured yet — there is nothing to build/lint/test until implementation begins per `plan.md` Phase 0. Do not invent or assume commands for this repo; if asked to run a build/lint/test, check whether Phase 0 scaffolding has actually happened yet.

## Working in this repo right now

Most work in this repo today is **editing the planning documents themselves**, not writing application code. When asked to review, revise, or extend `plan.md`/`spec.md`/`intent.md`:

- Treat requirement IDs (`FR-`, `NFR-`, `DR-`, `UX-`, `PR-`, `SR-`, `AC-`, `OQ-`, `A-`) as stable identifiers — preserve them across edits, and add new ones with the next unused number in their series rather than renumbering existing ones (renumbering breaks every cross-reference to that ID elsewhere in the three documents).
- `plan.md`'s **Architecture Decisions** section records the pre-decided technical direction (React Native/Expo + React Native Web, Supabase, dual web/native 3D renderers behind a shared contract, external exercise/food datasets) as lightweight ADRs with alternatives, trade-offs, and fallbacks. Don't re-litigate these choices or propose alternatives unless there's a clear conflict with `spec.md` — that discussion already happened and is recorded there.
- `plan.md`'s **Requirements Traceability** section maps every `spec.md` requirement ID to an owning phase. If you add or change a requirement in `spec.md`, check whether it needs a corresponding row/owner in that table and in the phase(s) it affects.
- `plan.md`'s **Unresolved Questions Blocking Specific Phases** table and the `OQ-`/`A-` entries in `spec.md`/`intent.md` are the canonical list of open decisions. Don't silently resolve one while editing — either resolve it explicitly (and remove/update the entry) or leave it flagged.

## Architecture the plan commits to (once implementation starts)

This is the intended structure recorded in `plan.md`, not yet built:

```
/apps/app/                  - Expo app (iOS, Android, Web)
/packages/core/             - Deterministic business logic (planning, nutrition, progression, PRs, units)
/packages/api-client/       - Supabase client + typed data access
/packages/three-model/      - Shared 3D muscle model component (web + native implementations behind one contract)
/packages/ui/                - Shared UI components
/supabase/                  - Migrations, RLS policies, edge functions, seed data
/data/                       - Source datasets + import/tagging scripts for exercises/food
/docs/                       - Checklists, licensing records, and supporting docs
/e2e/                        - Cross-platform end-to-end tests
```

Key structural decisions to be aware of before writing any code against this plan:

- **Deterministic business logic is isolated from UI and from Supabase.** Plan generation, nutrition calculation, progressive overload, PR derivation, and unit conversion live in framework-agnostic `packages/core` TypeScript, unit-testable without a UI or a live backend. Per `intent.md`/`spec.md` AI-1–AI-4, no AI/LLM component may ever produce these numeric outputs directly — they must come from this deterministic layer.
- **The 3D muscle model is two renderer implementations behind one shared interaction contract** (`packages/three-model/src/interactionContract.ts`): `@react-three/fiber` on web, `expo-gl` on native. Normalized region IDs and selection/camera semantics are defined once in the contract; both renderers must conform to it, and a cross-renderer parity test suite is required — this is the plan's highest technical-risk area (see `plan.md` R-7).
- **Barcode/food scanning is intentionally platform-split** (`BarcodeScanScreen.native.tsx` vs `.web.tsx`), because browser camera/barcode APIs are materially less reliable than native ones. Manual barcode entry is a required fallback on web, not an afterthought.
- **Workout plans and nutrition targets are versioned, not mutated.** Regenerating a plan or targets inserts a new `plan_version`/`target_version` row (with `effective_from`/`superseded_at`) rather than overwriting the existing one, so historical logs stay attributable to the plan/targets active when they were logged (DR-5). Any code that reads "the current plan" for a user must be careful to distinguish that from "the plan version a given historical log was created against."
- **RLS (row-level security) is the access-control boundary**, not application-layer checks — every user-scoped table must reject cross-user reads/writes/deletes at the database level, verified by adversarial tests run through the real API starting in Phase 1, not just checked once at the end.
- **External assets/datasets (3D mesh, exercise dataset, food/barcode sources) are gated behind a licensing go/no-go checkpoint (Phase 0.5)** before any phase builds content on top of them. Don't assume a dataset's license is fine just because it's referenced in the plan — check `/docs/licensing/` (once it exists) for the actual sign-off.

Phase sequencing and dependencies between phases are laid out in `plan.md`'s "Phase Dependency Overview" — consult it before assuming a feature can be built independently of another.
