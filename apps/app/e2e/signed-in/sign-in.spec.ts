import { expect, test } from '@playwright/test'
import { readRun } from '../support'

// A second phone: signs in fresh with the password the client chose, then signs out again.
// Signing out ends only this phone's sign-in, so the other tests stay signed in.
test.use({ storageState: { cookies: [], origins: [] } })

test('signs in with their own password and signs out from Profile', async ({ page }) => {
  const { client } = readRun()
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('Email').fill(client.email)
  await page.getByLabel('Password', { exact: true }).fill(client.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { level: 1, name: /, E2E$/ })).toBeVisible()

  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Profile' })
    .click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  const confirm = page.getByRole('dialog', { name: 'Sign out' })
  await confirm.getByRole('button', { name: 'Sign out' }).click()

  await expect(page).toHaveURL(/\/login$/)
  // Signed out for real: the app sends them back to sign-in.
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  expect((await page.request.get('/api/me')).status()).toBe(401)
})
