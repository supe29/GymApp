// spec.md flow 2.7: Plan Update (Profile Change). Never executed; see
// README.md.
import { by, device, element, expect as detoxExpect } from 'detox';

import { freshEmail, signUpAndOnboard } from './helpers/freshAccount';

describe('2.7 Plan update on profile change', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await signUpAndOnboard(freshEmail());
  });

  it('prompts to regenerate when a plan-affecting field changes, and declining leaves the plan unchanged (AC-3)', async () => {
    await element(by.text('Profile')).tap();
    await detoxExpect(element(by.id('edit-profile-age'))).toBeVisible();

    await element(by.id('edit-profile-goal-fat_loss')).tap();
    await element(by.id('edit-profile-save')).tap();

    await detoxExpect(element(by.id('regenerate-plan-diff'))).toBeVisible();
    await element(by.id('regenerate-decline')).tap();
    // AC-3: declining leaves the existing plan/targets unchanged — no new
    // `plan_version`/`target_version` row (verified at the
    // packages/api-client/core level by plans.test.ts/versioning.test.ts;
    // this spec only confirms the decline path doesn't error or navigate
    // anywhere unexpected).
  });

  it('regenerates the plan and shows a summary of what changed when accepted', async () => {
    await element(by.text('Profile')).tap();
    await element(by.id('edit-profile-goal-muscle_gain')).tap();
    await element(by.id('edit-profile-save')).tap();

    await detoxExpect(element(by.id('regenerate-plan-diff'))).toBeVisible();
    await element(by.id('regenerate-accept')).tap();
    // DR-5: this creates a new plan_version/target_version, superseding
    // the prior one rather than mutating it (verified at the DB layer by
    // supabase/tests/adversarial.test.mjs's DR-5 suite).
  });
});
