import path from 'node:path'
import { expect, type Page } from '@playwright/test'

export const BASE_URL = 'http://localhost:5174'
/** The phone app's dev server: its sign-in is separate from the dashboard's. */
export const APP_URL = 'http://localhost:5173'

/** The e2e coach signed in to the dashboard, saved by global.setup.ts. */
export const COACH_STATE = path.join(import.meta.dirname, '.auth', 'coach.json')

/**
 * Fails the test when the page is wider than the screen (only chip rows and wide tables inside
 * their card may scroll sideways). Waits for transitions to settle first.
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
