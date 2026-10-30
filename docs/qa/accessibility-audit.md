# Accessibility Audit (NFR-5, Phase 13)

NFR-5: "Screens must meet baseline accessibility practice (adequate
contrast, readable text sizes, screen-reader-friendly labels on non-3D
UI); the 3D model itself may rely on visual interaction but must have a
non-visual fallback (e.g., a plain list of muscle groups) for users who
cannot use it."

**Starting state**: a repo-wide grep for `accessibilityLabel|accessibilityRole|accessible=`
across `apps/app` found exactly one match (`MuscleListFallback.tsx`) before
this pass. Every other screen had zero explicit accessibility props —
screen-reader users would have heard raw, unlabeled touch targets
everywhere. This was a full audit, not a targeted icon-only pass: every
interactive element across every screen was reviewed.

## 3D model non-visual fallback (the NFR-5 line explicitly named in spec.md)

**Confirmed adequate, no changes needed.** `MuscleListFallback.tsx` (already
accessible before this pass: `accessibilityRole="button"` +
`accessibilityLabel` per row) is wired into `MuscleExplorerScreen.tsx` as a
real alternate `viewMode`, not a degraded stub — selecting a muscle group
from the list sets the same `selectedRegionId` state the 3D model's tap
handler does, which drives the same `filterByMuscleGroup` +
`filterByEquipmentSubset` pipeline and renders the same
`muscle-explorer-exercise-list`. A screen-reader user reaches the identical
muscle-to-exercise browsing capability as a 3D-capable user (AC-5), just
through list rows instead of 3D taps. The toggle between "3D view" and
"List view" itself now also carries `accessibilityState={{selected}}` so
which mode is active is announced.

## What was added, by category

- **`accessibilityRole="button"`** on every `Pressable`/`Text`-with-`onPress`
  that lacked one — the large majority of fixes. Without this, screen
  readers on web/native have no reliable signal that these elements are
  interactive at all.
- **`accessibilityRole="alert"`** on every error/warning `Text` block (every
  `*-error`, `*-unsafe-warning`, `*-notice` testID in the app) so a
  screen-reader user is told immediately when a form submission fails or a
  safety warning (SR-2) appears, rather than having to discover it by
  reading the screen.
- **`accessibilityLabel`** on:
  - Icon-only stepper buttons (`-`/`+` glyphs) across `SetLogger.tsx`,
    `LogWeightModal.tsx`, `ProgressionSuggestionCard.tsx`'s override
    controls, `DiaryScreen.tsx`'s portion stepper — a bare "-" or "+" reads
    as "minus"/"plus" with no context otherwise.
  - `TextInput`s with no `placeholder` at all (`EditProfileScreen.tsx`'s and
    `ProfileSetupFlow.tsx`'s age/height/weight fields, `CustomFoodForm.tsx`'s
    four numeric macro fields) — these had an adjacent `<Text>` label that is
    **not** programmatically associated with the input in React Native, so a
    screen reader landing on the field would announce nothing.
  - `TextInput`s that do have a `placeholder` (all auth screens, search,
    manual barcode entry) — added anyway, since placeholder text disappears
    from the accessibility tree the moment the user types, leaving the field
    unlabeled again.
  - A handful of destructive/contextual actions where the visible text alone
    is ambiguous out of context (e.g. diary/weight-trend "Remove" buttons now
    say "Remove &lt;food/entry&gt;..." rather than bare "Remove" repeated once
    per row).
- **`accessibilityRole="checkbox"` + `accessibilityState={{checked}}`** on
  `DisclaimerScreen.tsx`'s acknowledgment row and `EquipmentChecklist.tsx`'s
  per-item rows — these render a custom `View`-based checkbox square, not a
  native checkbox input, so without this a screen reader has no way to know
  they're checkable or report their state.
- **`accessibilityState={{selected}}`** on every chip/toggle-style control
  (`EditProfileScreen.tsx`'s and `ProfileSetupFlow.tsx`'s `Chip`,
  `MuscleExplorerScreen.tsx`'s 3D/List toggle, `DiaryScreen.tsx`'s meal-slot
  buttons) so the currently-selected option is announced, not just visually
  distinguished by background color.
- **`accessibilityState={{expanded}}`** on disclosure toggles (`WorkoutPlanScreen.tsx`'s
  "Why?" link, `SessionScreen.tsx`'s "Substitute"/"Add exercise" toggles,
  `FreeformSessionScreen.tsx`'s "Add exercise" toggle) so a screen reader
  announces whether the revealed content is currently shown.
- **`accessibilityRole="progressbar"` + `accessibilityValue`** on
  `OnboardingProgressIndicator.tsx`'s step track.
- **`accessibilityRole="alert"`** (not just a label) on `NewPersonalRecordCard.tsx`'s
  container, so a newly-achieved PR is announced proactively when it
  appears post-session (UX-6's "surfaced proactively" intent), not only
  discoverable by reading down the screen.
- **An `accessibilityLabel` summarizing the data range** on `WeightTrendScreen.tsx`'s
  SVG trend line (an `<Svg>`/`<Polyline>` chart has no text content at all by
  default) — the exact values remain available either way via the entry list
  rendered immediately below the chart, which was already fully accessible
  text.

Not added: redundant `accessibilityLabel`s on buttons whose only child is
already a clear, unique `<Text>` label (e.g. "Sign up", "Cancel") — screen
readers already read that text as the accessible name, and stamping an
identical label on top adds noise without adding information.

## Contrast issues found

One real failure, fixed; nothing else flagged:

- **Fixed**: `WorkoutPlanScreen.tsx`'s `whyText` was `#777` on white —
  computed contrast ratio ≈4.49:1, just under the 4.5:1 AA threshold for
  normal-size text (12px, not "large text" by WCAG's size definition).
  Changed to `#666` (≈5.74:1), matching the color already used for
  equivalent secondary text elsewhere in the app (`#666` appears in a dozen
  other styles app-wide, all compliant).
- **Fixed**: `SessionScreen.tsx`'s `skippedText` was `#888` on white —
  computed contrast ratio ≈3.54:1, a clear AA failure. Changed to `#666` for
  the same reason.
- Spot-checked every other text/background color pair used across all 39
  screens (`#666`/`#555`/`#444`/`#111`/`#b00020`/`#2d6a4f`/`#8a5a00` against
  their respective white/`#f5f5f5`/`#fff3cd`/`#f0fff4` backgrounds) — all
  comfortably pass 4.5:1 for normal text; none needed changes.

## Verification

- `npm test` (root): 77 suites / 630 tests, all passing — no test assertions
  needed changes; every edit was additive accessibility props only, no
  component logic, prop contracts, or testIDs changed.
- `npm run typecheck` (root): clean.

## Out of scope / not re-verified here

- Real screen-reader device/browser testing (VoiceOver, TalkBack, NVDA) —
  no such runtime exists in this sandbox; this is a code-level
  role/label/contrast audit, not an empirical assistive-technology pass.
  Tracked as a gap in `/docs/deferred-production-checks.md`.
- `react-navigation`'s own bottom-tab and native-stack chrome (tab bar
  buttons, header back buttons) — these come from the library with their
  own built-in accessibility semantics, not custom code this audit owns.
