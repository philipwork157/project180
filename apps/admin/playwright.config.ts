import { defineConfig, devices } from '@playwright/test'

// End-to-end tests for the dashboard. The admin dev server proxies /api to the phone app's
// Worker, so both run (the root `bun run dev`), with the local D1 database.
// `setup` signs the e2e coach in; `teardown` removes everything the run made.
const signedIn = { storageState: 'e2e/.auth/coach.json' }

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
  },
  // The dashboard is used on laptops and on phones: check both. The coaching flows (which
  // make clients, workouts and programs) run once, on a laptop.
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      teardown: 'teardown',
      use: { ...devices['Desktop Chrome'] },
    },
    { name: 'teardown', testMatch: /global\.teardown\.ts/ },
    {
      name: 'desktop',
      testMatch: /(smoke|signed-in\/.*)\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], ...signedIn },
    },
    {
      name: 'phone',
      testMatch: /(smoke|signed-in\/pages)\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'], ...signedIn },
    },
  ],
  webServer: {
    command: 'bun run --cwd ../.. dev',
    url: 'http://localhost:5174/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
