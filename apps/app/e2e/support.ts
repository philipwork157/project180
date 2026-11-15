import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type APIRequestContext, expect, type Page, request } from '@playwright/test'
import { E2E_COACH } from '@project180/api/e2e'

export const BASE_URL = 'http://localhost:5173'

const auth = path.join(import.meta.dirname, '.auth')
/** The signed-in client (cookies and the phone's local storage), saved by global.setup.ts. */
export const CLIENT_STATE = path.join(auth, 'client.json')
/** What the setup made this run, for the tests and for global.teardown.ts. */
export const RUN_FILE = path.join(auth, 'run.json')

export interface Run {
  client: { id: number; name: string; email: string; password: string }
  workout: { id: number; name: string; exercises: string[] }
  programId: number
}

export function readRun(): Run {
  return JSON.parse(readFileSync(RUN_FILE, 'utf8')) as Run
}

/** An API client signed in as the e2e coach, as the phone app's Worker sees it. */
export async function coachApi(): Promise<APIRequestContext> {
  // The API refuses cross-site writes, so say where we come from, as the browser does.
  const ctx = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { origin: BASE_URL },
  })
  const res = await ctx.post('/api/auth/sign-in/email', {
    data: { email: E2E_COACH.email, password: E2E_COACH.password },
  })
  expect(res.status(), await res.text()).toBe(200)
  return ctx
}

/**
 * Fails the test when the page is wider than the screen (only chip rows may scroll sideways).
 * Waits for screen transitions to settle: a screen sliding in is briefly wider.
 */
export async function expectNoSidewaysScroll(page: Page) {
  await expect
    .poll(
      // Runs in the page (as text: this file is type-checked without the browser's types).
      () =>
        page.evaluate<number>(
          'document.documentElement.scrollWidth - document.documentElement.clientWidth',
        ),
      { message: 'the page scrolls sideways' },
    )
    .toBeLessThanOrEqual(0)
}
