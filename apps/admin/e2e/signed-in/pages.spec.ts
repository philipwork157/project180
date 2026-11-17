import { expect, test } from '@playwright/test'
import { APP_URL, expectNoSidewaysScroll } from '../support'

const PAGES = [
  { link: 'Today', path: '/', heading: 'Hi, E2E' },
  { link: 'Clients', path: '/clients', heading: 'Clients' },
  { link: 'Programs', path: '/programs', heading: 'Programs' },
  { link: 'Workouts', path: '/workouts', heading: 'Workouts' },
  { link: 'Exercises', path: '/exercises', heading: 'Exercises' },
  { link: 'Recipes', path: '/recipes', heading: 'Recipes' },
]

// Runs on a laptop and on a phone (see playwright.config.ts).
test('every page opens from the menu and fits the screen', async ({ page, isMobile }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  for (const p of PAGES) {
    // Phones get the menu as a drawer behind a button; laptops have the sidebar.
    if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click()
    await page
      .getByRole('navigation', { name: 'Dashboard' })
      .getByRole('link', { name: p.link, exact: true })
      .last()
      .click()
    await expect(page).toHaveURL(new RegExp(`${p.path}$`))
    await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible()
    await expectNoSidewaysScroll(page)
  }
  expect(errors).toEqual([])
})

test('settings opens from the account menu', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click()
  await page
    .getByRole('button', { name: /^E2E Coach/ })
    .last()
    .click()
  await page.getByRole('menuitem', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectNoSidewaysScroll(page)
})

test('signing in to the dashboard doesn’t sign you in to the phone app', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Hi, E2E' })).toBeVisible()
  await page.goto(APP_URL)
  await expect(page).toHaveURL(`${APP_URL}/login`)
})
