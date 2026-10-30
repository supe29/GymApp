import { defineConfig, devices } from '@playwright/test';

const PORT = 8099;
const BASE_URL = `http://localhost:${PORT}`;

/**
 * Phase 13 signed-out smoke suite. Scoped deliberately to what's reachable
 * without a real backend — see e2e/README.md for why. The app always talks
 * to a real Supabase client (apps/app/lib/supabaseClient.ts), so this starts
 * the Expo web dev server with placeholder credentials: supabase-js's
 * getSession() reads local storage only when there's no cached session,
 * so a placeholder URL is never actually hit by the screens this suite
 * exercises (pure navigation + pre-network client-side validation).
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    cwd: '../apps/app',
    url: BASE_URL,
    timeout: 90_000,
    reuseExistingServer: !process.env.CI,
    env: {
      EXPO_PUBLIC_SUPABASE_URL: 'https://placeholder.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
      CI: '1',
    },
  },
});
