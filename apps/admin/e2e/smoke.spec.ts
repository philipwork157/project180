import { expect, test } from '@playwright/test'

test('opens on sign-in', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
})

test('the API is reachable through the dashboard', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(await res.json()).toEqual({ ok: true })
})

test('signed-out visitors get nothing from the API', async ({ request }) => {
  for (const path of ['/api/me', '/api/admin/users', '/api/admin/overview', '/api/exercises']) {
    expect((await request.get(path)).status(), path).toBe(401)
  }
})

test('a wrong password says so and stays on sign-in', async ({ page }) => {
  await page.goto('/login')
  // A fresh address each run: the sign-in limit counts wrong passwords per email.
  await page.getByLabel('Email').fill(`nobody-${Date.now()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('That email and password don’t match.')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
})

test('the sign-in screen fits the screen (nothing scrolls sideways)', async ({ page }) => {
  await page.goto('/login')
  // Runs in the page (as text: this file is type-checked without the browser's types).
  const overflow = await page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('loads no scripts, styles or fonts from other sites', async ({ page }) => {
  const outside: string[] = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.hostname !== 'localhost') outside.push(req.url())
  })
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  expect(outside).toEqual([])
})
