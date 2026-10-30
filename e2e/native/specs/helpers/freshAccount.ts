// Shared setup for specs 2.2–2.7, which all need a signed-in, onboarded
// user. Re-runs the real sign-up + onboarding UI (spec 2.1) rather than
// seeding a fixture account — see README.md's note on why: no test-account
// factory exists yet. Never executed; see README.md.
import { by, element, expect as detoxExpect } from 'detox';

export function freshEmail(): string {
  return `e2e+${Date.now()}@example.test`;
}

/**
 * Drives sign-up → profile setup → equipment → disclaimer → dashboard.
 * Values are representative, not exhaustive — each field's screen is
 * exercised individually by spec 2.1's own test.
 */
export async function signUpAndOnboard(email: string, password = 'TestPassword123!') {
  await element(by.id('signup-goto-signin')).atIndex(0).tap().catch(() => undefined);
  await element(by.id('signup-email')).typeText(email);
  await element(by.id('signup-password')).typeText(password);
  await element(by.id('signup-submit')).tap();

  await element(by.id('onboarding-age')).typeText('28');
  await element(by.id('onboarding-height')).typeText('175');
  await element(by.id('onboarding-weight')).typeText('75');
  await element(by.id('onboarding-next')).tap();
  // Fitness level / goal / training-days / equipment / disclaimer steps
  // follow; each has its own dedicated testIDs exercised in
  // profile-plan-generation.e2e.ts (spec 2.1). Here we only need to reach
  // the dashboard, so we keep advancing with default selections.
  await element(by.id('onboarding-next')).tap();

  await detoxExpect(element(by.id('dashboard-screen'))).toBeVisible();
}
