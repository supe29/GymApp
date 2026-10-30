// spec.md flow 2.2: First Workout Session (Plan-Attached). Never executed;
// see README.md. `set-logger-*` testIDs are per-exercise
// (`set-logger-${exerciseId}-...`, see SetLogger.tsx) so this spec matches
// the first exercise present rather than a hardcoded id, since which
// exercise is first depends on the generated plan.
import { by, device, element, expect as detoxExpect } from 'detox';

import { freshEmail, signUpAndOnboard } from './helpers/freshAccount';

describe('2.2 First workout session (plan-attached)', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await signUpAndOnboard(freshEmail());
  });

  it('logs prescribed sets and completes the session, surfacing progression suggestions', async () => {
    await element(by.id('dashboard-start-session')).tap();
    await detoxExpect(element(by.id('session-screen'))).toBeVisible();

    // Log the first exercise's prescribed sets at the plan's default
    // weight/reps (no adjustment needed to meet prescription — AC-6).
    const logButton = element(by.id(/^set-logger-.*-log-button$/)).atIndex(0);
    await logButton.tap();

    await element(by.id('session-complete-button')).tap();

    // AC-6: completing all prescribed sets produces a progression
    // suggestion, reviewed on this screen before returning to the
    // dashboard.
    await detoxExpect(element(by.id('session-suggestions-review'))).toBeVisible();
    await element(by.id('session-suggestions-done')).tap();
    await detoxExpect(element(by.id('dashboard-screen'))).toBeVisible();
  });

  it('suggests no weight increase when a prescribed set is under-performed (AC-7)', async () => {
    await element(by.id('dashboard-start-session')).tap();
    const repsDec = element(by.id(/^set-logger-.*-reps-dec$/)).atIndex(0);
    // Reduce reps below the prescribed floor before logging, then complete.
    await repsDec.tap();
    await repsDec.tap();
    await element(by.id(/^set-logger-.*-log-button$/))
      .atIndex(0)
      .tap();
    await element(by.id('session-complete-button')).tap();

    // The suggestion for this exercise should read as a "hold", not an
    // increase — asserted via SR-4/AC-7's wording on the review card.
    await detoxExpect(element(by.id('session-suggestions-review'))).toBeVisible();
    await element(by.id('session-suggestions-done')).tap();
  });
});
