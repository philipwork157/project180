import { expect, type Page, test } from '@playwright/test'
import { E2E_DOMAIN, E2E_PREFIX } from '@project180/api/e2e'

// A coach's main job, in order: build a workout, put it in a program, add a client on that
// program. Each step uses what the one before made. global.teardown.ts removes it all.
test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const exercise = `${E2E_PREFIX} Press ${stamp}`
const workout = `${E2E_PREFIX} Upper ${stamp}`
const program = `${E2E_PREFIX} Block ${stamp}`
const client = { name: `${E2E_PREFIX} Sam ${stamp}`, email: `e2e-sam-${stamp}@${E2E_DOMAIN}` }

let tempPassword = ''

const toast = (page: Page) =>
  page.getByRole('region', { name: 'Notifications' }).getByRole('status')

test('builds a workout, adding a new exercise on the way', async ({ page }) => {
  await page.goto('/workouts')
  await page.getByRole('link', { name: 'New workout' }).first().click()
  await expect(page).toHaveURL(/\/workouts\/new$/)

  // A name that isn't in the library yet: Enter creates the exercise and adds it.
  await page.getByRole('searchbox', { name: 'Search or type a new name' }).fill(exercise)
  await expect(page.getByRole('button', { name: `Create “${exercise}”` })).toBeVisible()
  await page.keyboard.press('Enter')

  const list = page.getByRole('region', { name: 'Exercises in this workout' })
  await expect(list.getByText(exercise)).toBeVisible()
  await expect(list).toContainText(/1 exercise\s*·\s*3 sets/)
  await list.getByRole('button', { name: 'Less sets' }).click()
  await expect(list.getByRole('textbox', { name: 'sets' })).toHaveValue('2')

  await page.getByRole('textbox', { name: 'Workout name' }).fill(workout)
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await page.getByRole('button', { name: 'Create workout' }).click()

  await expect(toast(page)).toContainText('Changes saved')
  await expect(page).toHaveURL(/\/workouts\/\d+$/)
  await expect(page.getByText('Unsaved changes')).toBeHidden()

  await page.getByRole('link', { name: 'Back to workouts' }).click()
  await page.getByRole('searchbox', { name: 'Search workouts' }).fill(workout)
  await expect(page.getByRole('main').getByText(workout)).toBeVisible()
})

test('leaving an editor with unsaved changes asks first', async ({ page }) => {
  await page.goto('/workouts/new')
  await page.getByRole('textbox', { name: 'Workout name' }).fill(`${E2E_PREFIX} Never saved`)
  await page.getByRole('link', { name: 'Back to workouts' }).click()

  const ask = page.getByRole('alertdialog').or(page.getByRole('dialog'))
  await expect(ask).toContainText('Leave without saving?')
  await ask.getByRole('button', { name: 'Keep editing' }).click()
  await expect(ask).toBeHidden()
  await expect(page).toHaveURL(/\/workouts\/new$/)
  await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue(
    `${E2E_PREFIX} Never saved`,
  )

  await page.getByRole('link', { name: 'Back to workouts' }).click()
  await ask.getByRole('button', { name: 'Leave without saving' }).click()
  await expect(page).toHaveURL(/\/workouts$/)
})

test('builds a program from that workout', async ({ page }) => {
  await page.goto('/programs')
  await page.getByRole('link', { name: 'New program' }).first().click()
  await expect(page).toHaveURL(/\/programs\/new$/)
  await page.getByRole('textbox', { name: 'Program name' }).fill(program)

  // Clicking a day opens a side panel to pick its workout.
  for (const day of [1, 3]) {
    await page.getByRole('button', { name: `Week 1 day ${day}: Rest. Change` }).click()
    const panel = page.getByRole('dialog', { name: `Week 1 · Day ${day}` })
    await panel.getByRole('button', { name: new RegExp(`^${workout}`) }).click()
    await expect(panel).toBeHidden()
    await expect(
      page.getByRole('button', { name: new RegExp(`^Week 1 day ${day}: ${workout}`) }),
    ).toBeVisible()
  }
  await page.getByRole('button', { name: 'Weigh-in on week 1 day 1' }).click()
  // Copy week 1 to the other three weeks: a bulk edit, with Undo in the toast.
  await page.getByRole('button', { name: 'Copy this week to every week' }).first().click()
  await expect(toast(page).getByRole('button', { name: 'Undo' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Schedule' })).toContainText(/8 workouts in total/)

  await page.getByRole('button', { name: 'Create program' }).click()
  await expect(toast(page).last()).toContainText('Changes saved')
  await expect(page).toHaveURL(/\/programs\/\d+$/)

  await page.goto('/programs')
  await page.getByRole('searchbox', { name: 'Search programs' }).fill(program)
  await expect(page.getByRole('main').getByText(program)).toBeVisible()
})

test('adds a client on that program', async ({ page }) => {
  await page.goto('/clients')
  await page.getByRole('button', { name: 'Add person' }).click()
  const wizard = page.getByRole('dialog', { name: 'Add a person' })

  await expect(wizard.getByText('Step 1 of 4: Who')).toBeVisible()
  await wizard.getByLabel('Full name').fill(client.name)
  await wizard.getByLabel('Email').fill(client.email)
  // A temporary password is made up for them; they choose their own on first sign-in.
  tempPassword = await wizard.getByRole('textbox', { name: 'Temporary password' }).inputValue()
  expect(tempPassword.length).toBeGreaterThanOrEqual(8)
  await wizard.getByRole('button', { name: 'Continue' }).click()

  await expect(wizard.getByText('Step 2 of 4: Body')).toBeVisible()
  await wizard.getByLabel('Weight now (kg)').fill('80')
  await wizard.getByRole('button', { name: 'Next' }).click()

  await expect(wizard.getByText('Step 3 of 4: Goals')).toBeVisible()
  await wizard.getByRole('radio', { name: 'Get stronger' }).click()
  await wizard.getByRole('button', { name: 'Next' }).click()

  await expect(wizard.getByText('Step 4 of 4: Program')).toBeVisible()
  await wizard
    .getByRole('combobox', { name: 'Program' })
    .selectOption({ label: `${program} · 4 wks` })
  await wizard.getByRole('checkbox', { name: /^Email E2E their sign-in details/ }).uncheck()
  await expect(wizard.getByRole('definition').filter({ hasText: client.email })).toBeVisible()
  await wizard.getByRole('button', { name: 'Add client' }).click()

  // Done: the sign-in details to send them (email isn't set up locally, so it says so).
  const done = page.getByRole('dialog', { name: 'E2E is in' })
  await expect(done).toContainText(`Email: ${client.email}`)
  await expect(done).toContainText(`Temporary password: ${tempPassword}`)
  await done.getByRole('button', { name: 'Done' }).click()
  await expect(done).toBeHidden()

  // The clients table: a row opens the client's page.
  const row = page.getByRole('main').getByRole('link', { name: new RegExp(client.name) })
  await expect(row).toContainText(program)
  await row.click()
  await expect(page).toHaveURL(/\/clients\/\d+$/)
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(client.name) })).toBeVisible()
  await expect(page.getByText('of 8 workouts done')).toBeVisible()
  await page.getByRole('link', { name: 'Progress', exact: true }).click()
  await expect(page).toHaveURL(/\/clients\/\d+\?tab=progress$/)
  // The weight typed in the wizard is their first weigh-in.
  await expect(
    page.getByRole('img', { name: /^Body weight, 1 points, from 80 to 80 kg/ }),
  ).toBeVisible()
})
