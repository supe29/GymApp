# Web/Mobile Parity Checklist (NFR-1, Phase 11)

NFR-1: "Core functionality (profile, plan generation, logging, 3D model,
progress) must be available with equivalent behavior on both web and
mobile — no feature exclusive to one platform in V1." This is a documented
review, not new device testing — no native iOS/Android runtime exists in
this environment (tracked in `/docs/deferred-production-checks.md`).

## Required line items (explicitly named by Phase 11's own scope)

- [x] **Phase 4 — 3D muscle model.** See `/packages/three-model/PARITY_REPORT.md`
  for the full cross-renderer parity report: the web (`@react-three/fiber`)
  and native (`expo-gl`) adapters both route every gesture through the same
  shared `interactionContract.ts`/`gestureMath.ts` functions, verified by
  `packages/three-model/src/__tests__/parity/crossRendererParity.test.ts`.
  `MuscleListFallback.tsx` provides the NFR-5 non-visual fallback on both
  platforms identically. **Caveat carried over from Phase 4**: the native
  adapter's actual touch-to-gesture wiring has never run on a real
  device (no iOS/Android runtime here) — it calls the identical shared
  functions the web adapter does, which is a structural guarantee, not an
  empirically verified one. Still open in `deferred-production-checks.md`.
- [x] **Phase 9 — barcode scanning platform split.** `BarcodeScanScreen.web.tsx`
  and `BarcodeScanScreen.native.tsx` share one prop contract
  (`{ onBarcodeScanned, onManualEntry }`) behind a `Platform.OS` dispatcher
  (`BarcodeScanScreen.tsx`), matching `BodyModel.tsx`'s precedent. Both
  platforms converge on the same outcome for every path: a found barcode
  calls `onBarcodeScanned`; an unsupported browser, a denied camera
  permission, or a barcode not found in the data source all call
  `onManualEntry` — never a dead end (FR-7.4/AC-10). Web's real
  `BarcodeDetector`/`getUserMedia` logic is exercised by
  `BarcodeScanScreen.web.test.tsx`; native's `expo-camera` wiring has the
  same "unverified on a real device" caveat as the 3D model's native
  adapter.

## Screen-by-screen review (Phases 2–10)

Every screen below is built with `react-native`/`react-native-web`
primitives only (`View`, `Text`, `Pressable`, `TextInput`, `ScrollView`,
`FlatList`) plus `react-native-svg` (Phase 10's weight-trend chart,
cross-platform by design) — none uses a web-only or native-only API outside
the two items above.

| Area | Screens | Platform-specific code? |
|---|---|---|
| Auth | `SignInScreen`, `SignUpScreen`, `ForgotPasswordScreen`, `ResetPasswordScreen` | OAuth redirect uses `expo-web-browser`/`expo-linking`, both cross-platform Expo APIs. |
| Onboarding/Profile | `ProfileSetupFlow`, `EditProfileScreen`, `EquipmentChecklist`, `OnboardingProgressIndicator`, `DisclaimerScreen` | None. |
| Muscle Explorer | `MuscleExplorerScreen`, `MuscleListFallback` | See 3D model item above. |
| Exercise Library | `ExerciseDetailScreen` | None. |
| Plan/Nutrition targets | `WorkoutPlanScreen`, `NutritionTargetsScreen`, `RegeneratePlanPrompt`, `ProgressionSuggestionCard` | None. |
| Workout session | `SessionScreen`, `FreeformSessionScreen`, `SetLogger`, `RestTimer` | None — `offlineQueue.ts`'s retry logic is pure JS, no platform branch. |
| History | `WorkoutHistoryScreen` | None. |
| Nutrition diary | `DiaryScreen`, `FoodSearchScreen`, `CustomFoodForm`, `ManualBarcodeEntry` | None (the diary itself); see barcode item above for the one screen that does split. |
| Progress | `WeightTrendScreen`, `PersonalRecordsScreen`, `LogWeightModal`, `NewPersonalRecordCard` | None — `react-native-svg` chart renders identically on both. |
| Navigation (Phase 11) | `AuthNavigator`, `MainTabs`, `OnboardingFlow`, `DashboardScreen`, `EmptyState` | None — `react-navigation`'s native-stack/bottom-tabs are explicitly cross-platform (including web). |

## Open items (not resolved by this checklist — tracked separately)

- Real on-device iOS/Android verification of the two "required line items"
  above — added to `/docs/deferred-production-checks.md`.
- ~~OQ-10 (3D parity tolerance — exact acceptable visual/behavioral
  deviation between renderers) remains open per `plan.md`~~ — **resolved in
  Phase 13**: see `/docs/decisions/OQ-10-3d-parity-tolerance.md` (tolerance
  is zero at the state layer, by construction of the shared-math contract).
