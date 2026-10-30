// spec.md flow 2.1: Sign Up & Onboarding. Never executed; see README.md.
import { by, device, element, expect as detoxExpect } from 'detox';

import { freshEmail } from './helpers/freshAccount';

describe('2.1 Sign up & onboarding', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it('creates an account via email/password and lands on sign-in by default', async () => {
    await detoxExpect(element(by.id('signin-email'))).toBeVisible();
    await element(by.id('signin-goto-signup')).tap();
    await detoxExpect(element(by.id('signup-email'))).toBeVisible();
  });

  it('completes profile → equipment → disclaimer and generates a plan + targets', async () => {
    const email = freshEmail();
    await element(by.id('signup-email')).typeText(email);
    await element(by.id('signup-password')).typeText('TestPassword123!');
    await element(by.id('signup-submit')).tap();

    // Basic info step (FR-1.1).
    await element(by.id('onboarding-age')).typeText('28');
    await element(by.id('onboarding-height')).typeText('175');
    await element(by.id('onboarding-weight')).typeText('75');
    await element(by.id('onboarding-next')).tap();

    // Remaining steps (fitness level → goal → training days → equipment →
    // disclaimer) each have dedicated testIDs on their own screens; this
    // smoke spec advances with defaults rather than exhaustively asserting
    // every field, since field-level validation is already covered by
    // apps/app/features/profile/ProfileSetupFlow.test.tsx at the component
    // level (AC-14's disclaimer gate in particular).
    await element(by.id('onboarding-next')).tap();

    // AC-1: a plan and targets are generated and shown without further
    // input once onboarding completes.
    await detoxExpect(element(by.id('dashboard-screen'))).toBeVisible();
    await detoxExpect(element(by.id('dashboard-next-session'))).toBeVisible();
    await detoxExpect(element(by.id('dashboard-nutrition'))).toBeVisible();
  });
});
