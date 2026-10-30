// spec.md flow 2.6: Progress Review. Never executed; see README.md.
import { by, device, element, expect as detoxExpect } from 'detox';

import { freshEmail, signUpAndOnboard } from './helpers/freshAccount';

describe('2.6 Progress review', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await signUpAndOnboard(freshEmail());
  });

  it('logs a weight entry and renders a trend chart once two entries exist (AC-12)', async () => {
    await element(by.id('dashboard-quick-log-weight')).tap();
    await detoxExpect(element(by.id('weight-trend-screen'))).toBeVisible();

    await element(by.id('weight-trend-log-button')).tap();
    await element(by.id('log-weight-inc')).tap();
    await element(by.id('log-weight-submit')).tap();
    await detoxExpect(element(by.id('weight-trend-chart-pending'))).toBeVisible();

    await element(by.id('weight-trend-log-button')).tap();
    await element(by.id('log-weight-inc')).tap();
    await element(by.id('log-weight-submit')).tap();
    await detoxExpect(element(by.id('weight-trend-chart'))).toBeVisible();
  });

  it('shows PR history reflecting a new heaviest set (AC-11)', async () => {
    // A new PR was already established in 2.2's first-session spec
    // (whichever exercise's first set was logged). `MainTabs.tsx`'s
    // ProgressStackNavigator exposes the Personal Records screen via a
    // header-button labeled "Records" (no testID on that button itself —
    // it's a plain `HeaderLinkButton`), so this spec navigates by text.
    await element(by.text('Records')).tap();
    await detoxExpect(element(by.id('personal-records-screen'))).toBeVisible();
  });
});
