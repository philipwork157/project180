import { defineConfig, devices } from '@playwright/test'

// End-to-end tests for the dashboard. The admin dev server proxies /api to the phone app's
// Worker, so both run (the root `bun run dev`), with the local D1 database.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  // The dashboard is used on laptops and on phones: check both.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'bun run --cwd ../.. dev',
    url: 'http://localhost:5174/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
