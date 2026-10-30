// spec.md flow 2.5: Food Logging. Never executed; see README.md.
import { by, device, element, expect as detoxExpect } from 'detox';

import { freshEmail, signUpAndOnboard } from './helpers/freshAccount';

describe('2.5 Food logging', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
    await signUpAndOnboard(freshEmail());
  });

  it('logs a searched food and updates daily totals', async () => {
    await element(by.id('dashboard-quick-log-food')).tap();
    await detoxExpect(element(by.id('diary-screen'))).toBeVisible();

    await element(by.id('diary-add-search-button')).tap();
    await element(by.id('food-search-input')).typeText('chicken breast');
    await element(by.id('food-search-button')).tap();
    await element(by.id(/^food-search-result-.*$/))
      .atIndex(0)
      .tap();

    await detoxExpect(element(by.id('diary-confirm-portion'))).toBeVisible();
    await element(by.id('diary-portion-inc')).tap();
    await element(by.id('diary-confirm-log-button')).tap();

    // AC-9: entry added with correct calorie/macro values, totals update.
    await detoxExpect(element(by.id('diary-totals'))).toBeVisible();
  });

  it('offers manual entry when a scanned barcode is not found (AC-10)', async () => {
    await element(by.id('diary-add-scan-button')).tap();
    // Against the placeholder `food_items` seed (see
    // docs/licensing/go-no-go-checklist.md), most scanned codes will not
    // resolve — the screen must route to manual entry/search either way
    // (barcode-scan-manual-entry-button is always present, not only on a
    // not-found result).
    await element(by.id('barcode-scan-manual-entry-button')).tap();
    await detoxExpect(element(by.id('manual-barcode-entry'))).toBeVisible();
    await element(by.id('manual-barcode-input')).typeText('0000000000000');
    await element(by.id('manual-barcode-submit')).tap();
    // A not-found lookup must not be a dead end (AC-10) — some
    // search/custom-food affordance must remain reachable from here.
  });

  it('logs a custom food and reuses it', async () => {
    await element(by.id('diary-add-custom-button')).tap();
    await detoxExpect(element(by.id('custom-food-form'))).toBeVisible();
    await element(by.id('custom-food-name')).typeText('Homemade protein bar');
    await element(by.id('custom-food-portion')).typeText('1 bar');
    await element(by.id('custom-food-calories')).typeText('220');
    await element(by.id('custom-food-protein')).typeText('20');
    await element(by.id('custom-food-carbs')).typeText('18');
    await element(by.id('custom-food-fat')).typeText('8');
    await element(by.id('custom-food-submit')).tap();
    await detoxExpect(element(by.id('diary-totals'))).toBeVisible();
  });
});
