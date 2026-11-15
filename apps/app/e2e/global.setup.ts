import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test as setup } from '@playwright/test'
import { E2E_DOMAIN, E2E_PREFIX, ensureE2eCoach, sweepE2eData } from '@project180/api/e2e'
import { todayIn } from '@project180/shared'
import { BASE_URL, CLIENT_STATE, coachApi, RUN_FILE, type Run } from './support'

type Json = Record<string, any>

// One client per run, with a program that starts today, set up the way a coach would: through
// the API. Then the client signs in on the phone for the first time and chooses a password.
setup('a coach sets up a client, who signs in and chooses a password', async ({ page }) => {
  await ensureE2eCoach()
  // Anything a crashed earlier run left behind.
  await sweepE2eData(BASE_URL)
  const coach = await coachApi()
  const stamp = Date.now()

  // Two exercises: the library's if it has some (local dev), else made here (an empty database).
  const library = ((await (await coach.get('/api/exercises')).json()) as Json).exercises as Json[]
  const picked = library
    .filter((e) => e.trackingType === 'weight_reps' && !e.name.startsWith(E2E_PREFIX))
    .slice(0, 2)
  for (const [name, muscleGroup] of [
    [`${E2E_PREFIX} Goblet Squat`, 'legs'],
    [`${E2E_PREFIX} Dumbbell Row`, 'back'],
  ].slice(0, 2 - picked.length)) {
    const res = await coach.post('/api/exercises', {
      data: { name, muscleGroup, equipment: 'dumbbell' },
    })
    expect(res.status(), await res.text()).toBe(201)
    picked.push(((await res.json()) as Json).exercise)
  }

  const workoutRes = await coach.post('/api/workouts', {
    data: {
      name: `${E2E_PREFIX} Full Body ${stamp}`,
      exercises: picked.map((e) => ({
        exerciseId: e.id,
        targetSets: 2,
        targetRepsMin: 8,
        targetRepsMax: 10,
        restSeconds: 60,
      })),
    },
  })
  expect(workoutRes.status(), await workoutRes.text()).toBe(201)
  const { workout } = (await workoutRes.json()) as Json

  // Every day of the first week is this workout, so whatever day the tests run on is a workout
  // day; the first day (today) also asks for a weigh-in.
  const programRes = await coach.post('/api/programs', {
    data: {
      name: `${E2E_PREFIX} Program ${stamp}`,
      durationWeeks: 4,
      days: [1, 2, 3, 4, 5, 6, 7].map((dayNumber) => ({
        weekNumber: 1,
        dayNumber,
        workoutId: workout.id,
        checkinRequired: dayNumber === 1,
      })),
    },
  })
  expect(programRes.status(), await programRes.text()).toBe(201)
  const { program } = (await programRes.json()) as Json

  const client = {
    name: `${E2E_PREFIX} Client ${stamp}`,
    email: `e2e-client-${stamp}@${E2E_DOMAIN}`,
    password: 'temporary-password-1',
  }
  const created = await coach.post('/api/admin/users', {
    data: {
      ...client,
      program: { programId: program.id, startDate: todayIn('Africa/Johannesburg') },
    },
  })
  expect(created.status(), await created.text()).toBe(201)
  const { user } = (await created.json()) as Json
  await coach.dispose()

  const run: Run = {
    client: { ...client, id: user.id, password: 'my-own-password-1' },
    workout: { id: workout.id, name: workout.name, exercises: picked.map((e) => e.name) },
    programId: program.id,
  }
  mkdirSync(path.dirname(RUN_FILE), { recursive: true })
  writeFileSync(RUN_FILE, JSON.stringify(run, null, 2))

  // First sign-in on the phone, with the temporary password the coach gave them.
  await page.goto('/login')
  await page.getByLabel('Email').fill(client.email)
  await page.getByLabel('Password', { exact: true }).fill(client.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/choose-password$/)
  await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible()
  await page.getByLabel('New password').fill(run.client.password)
  await page.getByLabel('Type it again').fill(run.client.password)
  await page.getByRole('button', { name: 'Save and continue' }).click()

  // In: Today, with the program the coach assigned.
  await expect(page).toHaveURL(`${BASE_URL}/`)
  await expect(page.getByText(program.name)).toBeVisible()
  await page.context().storageState({ path: CLIENT_STATE })
})
