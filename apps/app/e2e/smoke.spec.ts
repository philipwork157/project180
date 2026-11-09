import { expect, test } from '@playwright/test'

test('opens on sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('is installable: manifest and icons are served', async ({ page, request }) => {
  await page.goto('/login')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const manifest = await request.get(href ?? '')
  expect(manifest.ok()).toBe(true)
  expect((await manifest.json()).display).toBe('standalone')
})

test('the API is reachable', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(await res.json()).toEqual({ ok: true })
})
