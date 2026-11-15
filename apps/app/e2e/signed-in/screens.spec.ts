import { expect, test } from '@playwright/test'
import { expectNoSidewaysScroll } from '../support'

const TABS = [
  { link: 'Today', path: '/' },
  { link: 'Calendar', path: '/calendar' },
  { link: 'Fuel', path: '/fuel' },
  { link: 'Progress', path: '/progress' },
  { link: 'Coach', path: '/chat' },
  { link: 'Profile', path: '/profile' },
]

// Every tab opens from the tab bar, without errors, on a phone and on a laptop.
for (const size of [
  { name: 'phone', width: 375, height: 812 },
  { name: 'desktop', width: 1440, height: 900 },
]) {
  test(`every tab opens and fits the screen (${size.name})`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize(size)
    await page.goto('/')
    for (const tab of TABS) {
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: tab.link })
        .click()
      await expect(page).toHaveURL(new RegExp(`${tab.path === '/' ? '/' : tab.path}$`))
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expectNoSidewaysScroll(page)
    }
    expect(errors).toEqual([])
  })
}

test('nothing in the app mentions the admin dashboard', async ({ page }) => {
  for (const tab of TABS) {
    await page.goto(tab.path)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.getByText(/admin|dashboard/i)).toHaveCount(0)
    await expect(page.locator('a[href*="5174"], a[href*="admin"]')).toHaveCount(0)
  }
})
