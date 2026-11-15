import { expect, test as setup } from '@playwright/test'
import { E2E_COACH, ensureE2eCoach, sweepE2eData } from '@project180/api/e2e'
import { BASE_URL, COACH_STATE } from './support'

// The e2e coach (an owner, made with the `admin:create` SQL) signs in to the dashboard once;
// the signed-in tests reuse that sign-in.
setup('the coach signs in to the dashboard', async ({ page }) => {
  await ensureE2eCoach()
  // Anything a crashed earlier run left behind.
  await sweepE2eData(BASE_URL)

  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email').fill(E2E_COACH.email)
  await page.getByLabel('Password', { exact: true }).fill(E2E_COACH.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(`${BASE_URL}/`)
  await expect(page.getByRole('heading', { level: 1, name: 'Hi, E2E' })).toBeVisible()
  await page.context().storageState({ path: COACH_STATE })
})
