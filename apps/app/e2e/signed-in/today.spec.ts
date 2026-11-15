import { expect, test } from '@playwright/test'
import { readRun } from '../support'

// One client's day, in order: what's waiting, the weigh-in, then today's workout start to finish.
test.describe.configure({ mode: 'serial' })

test('the bell lists the new program, the weigh-in and today’s workout', async ({ page }) => {
  const run = readRun()
  await page.goto('/')
  await page.getByRole('button', { name: /^Notifications, \d+ new$/ }).click()

  await expect(page).toHaveURL(/\/notifications$/)
  const list = page.getByRole('main').getByRole('list')
  await expect(list.getByRole('button', { name: /^New program:/ })).toBeVisible()
  await expect(list.getByRole('button', { name: /^Weigh-in today/ })).toBeVisible()
  await expect(
    list.getByRole('button', { name: `Today: ${run.workout.name}`, exact: false }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('logging the weigh-in clears it from Today', async ({ page }) => {
  await page.goto('/')
  const card = page.getByRole('region', { name: 'Weigh-in' })
  await card.getByRole('button', { name: 'Log my weight' }).click()

  const sheet = page.getByRole('dialog', { name: 'Log your weight' })
  const save = sheet.getByRole('button', { name: 'Save weight' })
  await expect(save).toBeDisabled()
  await sheet.getByRole('textbox', { name: /Body weight in kg/ }).fill('72.4')
  await save.click()

  await expect(sheet).toBeHidden()
  await expect(card).toBeHidden()
  // Still gone after a reload: it was saved, not just hidden.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible()
  await expect(card).toBeHidden()
})

test('a workout: log sets, keep them through a reload, finish and celebrate', async ({ page }) => {
  const run = readRun()
  const [first = '', second = ''] = run.workout.exercises
  await page.goto('/')
  await page.getByRole('button', { name: 'Start workout' }).click()

  await expect(page).toHaveURL(/\/workout\/\d+$/)
  await expect(page.getByRole('heading', { level: 1, name: run.workout.name })).toBeVisible()
  await expect(page.getByText('0/4 sets')).toBeVisible()

  // Each exercise is its own card (a section): its heading, then its set rows.
  const block = (name: string) =>
    page
      .getByRole('main')
      .locator('section')
      .filter({ has: page.getByRole('heading', { name }) })

  await block(first).getByRole('textbox', { name: 'Set 1 weight in kg' }).fill('20')
  await block(first).getByRole('textbox', { name: 'Set 1 reps' }).fill('10')
  await block(first).getByRole('button', { name: 'Complete set 1' }).click()
  await expect(block(first).getByRole('button', { name: 'Undo set 1' })).toBeVisible()
  // Ticking a set starts the rest timer.
  await expect(page.getByRole('timer', { name: /^Rest: / })).toBeVisible()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('timer')).toBeHidden()

  await block(second).getByRole('textbox', { name: 'Set 1 weight in kg' }).fill('12.5')
  await block(second).getByRole('button', { name: 'Complete set 1' }).click()
  await expect(page.getByText('2/4 sets')).toBeVisible()

  // A reload (or the phone killing the app) keeps the sets already ticked.
  await page.reload()
  await expect(page.getByText('2/4 sets')).toBeVisible()
  await expect(block(first).getByRole('textbox', { name: 'Set 1 weight in kg' })).toHaveValue('20')

  // Leaving the workout keeps it going, with a way back from Today.
  await page.getByRole('link', { name: 'Minimise' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.goBack()

  await page.getByRole('button', { name: 'Finish workout' }).last().click()
  const finish = page.getByRole('dialog', { name: 'Finish workout' })
  await expect(finish.getByText('2 unticked sets won’t be saved.')).toBeVisible()
  await finish.getByRole('radio', { name: 'Good' }).click()
  await finish.getByRole('button', { name: 'Finish workout' }).click()

  const done = page.getByRole('dialog', { name: 'Workout complete' })
  await expect(done.getByRole('heading', { name: run.workout.name })).toBeVisible()
  // 20 kg × 10 + 12.5 kg × 10 reps (the second set kept its suggested 10).
  await expect(done.getByText('325 kg')).toBeVisible()
  await done.getByRole('button', { name: 'Done' }).click()

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Done for today' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeHidden()
})
