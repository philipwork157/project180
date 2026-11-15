import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the real dev server (app + Worker + local D1).
// `setup` makes a client with a program (as the e2e coach) and signs them in on the phone; the
// signed-in tests reuse that sign-in; `teardown` removes everything the run made.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'smoke', testMatch: /smoke\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
      teardown: 'teardown',
      use: { ...devices['Pixel 7'] },
    },
    { name: 'teardown', testMatch: /global\.teardown\.ts/ },
    {
      name: 'phone',
      testMatch: /signed-in\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'], storageState: 'e2e/.auth/client.json' },
    },
  ],
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
