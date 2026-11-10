import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Errors Better Auth is meant to answer with in the sign-in and sign-up tests.
const EXPECTED_AUTH_ERRORS = new Set([
  'INVALID_EMAIL_OR_PASSWORD',
  'EMAIL_PASSWORD_SIGN_UP_DISABLED',
])

// API tests run inside the real Workers runtime against a local D1 database.
// test/apply-migrations.ts empties the database before every test, so each test sets up
// its own data.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.test.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, '../db/drizzle')),
        },
      },
    })),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
    // Better Auth answers a wrong password or a sign-up attempt with the right 401/400, but in
    // workerd its internal APIError also shows up as an "unhandled rejection". The tests check
    // those responses, so ignore exactly these expected errors and still fail on anything else.
    onUnhandledError(error) {
      const code = (error as { body?: { code?: string } }).body?.code
      if (error.name === 'APIError' && code && EXPECTED_AUTH_ERRORS.has(code)) return false
      return true
    },
  },
})
