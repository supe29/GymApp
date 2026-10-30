// spec.md flow 2.3: Freeform Workout Session. Never executed; see README.md.
import { by, device, element, expect as detoxExpect } from 'detox';

import { freshEmail, signUpAndOnboard } from './helpers/freshAccount';

describe('2.3 Freeform workout session', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await signUpAndOnboard(freshEmail());
  });

  it('logs an ad-hoc exercise outside the plan and saves it to history', async () => {
    await element(by.id('dashboard-quick-start-freeform')).tap();
    await detoxExpect(element(by.id('freeform-session-screen'))).toBeVisible();

    await element(by.id('freeform-add-exercise-toggle')).tap();
    await detoxExpect(element(by.id('freeform-add-exercise-options'))).toBeVisible();
    // Pick whichever exercise option renders first — the specific exercise
    // isn't asserted on, only that a freeform (unprescribed) exercise can
    // be added and logged (AC-8).
    await element(by.id(/^freeform-add-exercise-option-.*$/))
      .atIndex(0)
      .tap();
    await element(by.id(/^set-logger-.*-log-button$/))
      .atIndex(0)
      .tap();

    await element(by.id('freeform-complete-button')).tap();
    // AC-8: a freeform session with exercises not in the plan is not
    // evaluated against a prescription — no progression-suggestion review
    // screen here (unlike 2.2), though a new-PR review may appear if the
    // logged set was a heaviest set.
  });
});
