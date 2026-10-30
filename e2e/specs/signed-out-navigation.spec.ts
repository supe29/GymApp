import { expect, test, type Page } from '@playwright/test';

/**
 * Covers spec.md flow 2.1's entry point (sign-up/sign-in screens exist and
 * are navigable) at the UI level only, plus the zero-network client-side
 * validation on each signed-out screen. Does NOT submit real credentials —
 * see e2e/README.md for why (no real backend in this sandbox).
 *
 * react-native-screens can't truly unmount offscreen stack entries on web,
 * so a testID from a screen earlier in the stack can still match a hidden
 * DOM node after navigating away and back — `:visible` scopes every
 * testID lookup to the one actually on screen.
 */
function byTestId(page: Page, id: string) {
  return page.locator(`[data-testid="${id}"]:visible`);
}

test.describe('signed-out navigation', () => {
  test('loads to the Sign In screen by default', async ({ page }) => {
    await page.goto('/');
    await expect(byTestId(page, 'signin-email')).toBeVisible();
    await expect(byTestId(page, 'signin-password')).toBeVisible();
    await expect(byTestId(page, 'signin-submit')).toBeVisible();
    await expect(page.getByText('New here? Create an account')).toBeVisible();
  });

  test('navigates Sign In -> Sign Up -> Sign In', async ({ page }) => {
    await page.goto('/');
    await byTestId(page, 'signin-goto-signup').click();
    await expect(byTestId(page, 'signup-email')).toBeVisible();
    await expect(page.getByText('Create your account')).toBeVisible();

    await byTestId(page, 'signup-goto-signin').click();
    await expect(byTestId(page, 'signin-email')).toBeVisible();
  });

  test('navigates Sign In -> Forgot Password -> Sign In', async ({ page }) => {
    await page.goto('/');
    await byTestId(page, 'signin-goto-forgot-password').click();
    await expect(byTestId(page, 'forgot-password-email')).toBeVisible();
    await expect(page.getByText('Reset your password')).toBeVisible();

    await byTestId(page, 'forgot-password-goto-signin').click();
    await expect(byTestId(page, 'signin-email')).toBeVisible();
  });

  test('navigates Sign Up -> Privacy Policy -> Sign Up', async ({ page }) => {
    await page.goto('/');
    await byTestId(page, 'signin-goto-signup').click();
    await byTestId(page, 'signup-privacy-policy').click();

    await expect(byTestId(page, 'privacy-policy-scroll')).toBeVisible();
    await expect(page.getByText('What we collect')).toBeVisible();

    await byTestId(page, 'privacy-policy-close').click();
    await expect(byTestId(page, 'signup-email')).toBeVisible();
  });
});

test.describe('signed-out client-side validation (no network)', () => {
  test('Sign In: submitting with empty fields shows a validation error', async ({ page }) => {
    await page.goto('/');
    await byTestId(page, 'signin-submit').click();
    await expect(byTestId(page, 'signin-error')).toHaveText('Enter an email and password.');
  });

  test('Sign Up: submitting with empty fields shows a validation error', async ({ page }) => {
    await page.goto('/');
    await byTestId(page, 'signin-goto-signup').click();
    await byTestId(page, 'signup-submit').click();
    await expect(byTestId(page, 'signup-error')).toHaveText('Enter an email and password.');
  });

  test('Forgot Password: submitting with an empty email shows a validation error', async ({
    page,
  }) => {
    await page.goto('/');
    await byTestId(page, 'signin-goto-forgot-password').click();
    await byTestId(page, 'forgot-password-submit').click();
    await expect(byTestId(page, 'forgot-password-error')).toHaveText(
      'Enter your account email.',
    );
  });
});
