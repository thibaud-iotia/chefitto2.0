import { defineConfig, devices } from '@playwright/test';

/**
 * Projets :
 * - `iphone` / `android` : parcours complets, hors réseau (mode local, API d'import simulée) → `npm run e2e`.
 * - `live` : import sur de vraies pages (Marmiton, 750g) via le middleware Vite → `npm run e2e:live`.
 *   Séquentiel et sur un seul appareil pour rester sobre envers les sites sources.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'iphone', testIgnore: /live\.spec\.ts/, use: { ...devices['iPhone 15'], browserName: 'chromium' } },
    { name: 'android', testIgnore: /live\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    {
      name: 'live',
      testMatch: /live\.spec\.ts/,
      fullyParallel: false,
      retries: 1,
      timeout: 90_000,
      use: { ...devices['iPhone 15'], browserName: 'chromium', trace: 'retain-on-failure' },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { VITE_DATA_MODE: 'local' },
  },
});
