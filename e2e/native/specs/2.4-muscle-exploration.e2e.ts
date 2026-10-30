// spec.md flow 2.4: Muscle Exploration. Never executed; see README.md.
//
// The 3D canvas itself (rotate/zoom/tap-a-region) is gesture-driven inside
// a GL view, not a tree of individually-tappable native elements — Detox
// can drive raw gestures (`element(by.id('...')).tap({x, y})`) but asserting
// *which* region a coordinate-based tap hit depends on the live camera
// state, which this spec doesn't attempt to pin down. Instead this spec
// exercises the toggle to the non-visual list fallback (AC-5's explicitly
// required alternate path) and confirms the same muscle→exercise browsing
// capability is reachable through it, which is what AC-5 actually asks for.
import { by, device, element, expect as detoxExpect } from 'detox';

import { freshEmail, signUpAndOnboard } from './helpers/freshAccount';

describe('2.4 Muscle exploration', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await signUpAndOnboard(freshEmail());
  });

  it('browses exercises by muscle group via the non-visual fallback (AC-5)', async () => {
    await element(by.id('dashboard-quick-browse-muscles')).tap();
    await detoxExpect(element(by.id('muscle-explorer-toggle-3d'))).toBeVisible();

    await element(by.id('muscle-explorer-toggle-list')).tap();
    await detoxExpect(element(by.id('muscle-list-fallback'))).toBeVisible();

    await element(by.id(/^muscle-list-item-.*$/))
      .atIndex(0)
      .tap();

    // AC-4: only exercises tagged with the selected muscle group (primary
    // or secondary) appear, filtered by the user's declared equipment
    // (SR-6) — content correctness is covered at the `packages/core`
    // level (exerciseQueries.test.ts); this spec only confirms the list
    // renders and an exercise can be opened.
    await detoxExpect(element(by.id('muscle-explorer-exercise-list'))).toBeVisible();
    await element(by.id(/^muscle-explorer-exercise-.*$/))
      .atIndex(0)
      .tap();
    await detoxExpect(element(by.id('exercise-detail-screen'))).toBeVisible();
  });
});
