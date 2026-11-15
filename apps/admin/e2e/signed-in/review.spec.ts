import { type APIRequestContext, expect, request, test } from '@playwright/test'
import { E2E_DOMAIN, E2E_PREFIX } from '@project180/api/e2e'
import { todayIn } from '@project180/shared'
import { APP_URL, BASE_URL, COACH_STATE } from '../support'

type Json = Record<string, any>

const stamp = Date.now()
const names = {
  exercise: `${E2E_PREFIX} Deadlift ${stamp}`,
  workout: `${E2E_PREFIX} Pull ${stamp}`,
  program: `${E2E_PREFIX} Review ${stamp}`,
  client: `${E2E_PREFIX} Lee ${stamp}`,
}

async function ok(res: Awaited<ReturnType<APIRequestContext['get']>>): Promise<Json> {
  expect(res.ok(), `${res.url()}: ${res.status()} ${await res.text()}`).toBe(true)
  return (await res.json()) as Json
}

// The coach's side of a client's workout: a client trains on the phone (through the API here;
// apps/app/e2e covers the phone screens), the coach opens it set by set and leaves a comment,
// and the client can read it.
test('the coach reviews a finished workout and leaves a comment', async ({ page }) => {
  const coach = await request.newContext({
    baseURL: BASE_URL,
    storageState: COACH_STATE,
    extraHTTPHeaders: { origin: BASE_URL },
  })
  const { exercise } = await ok(
    await coach.post('/api/exercises', {
      data: { name: names.exercise, muscleGroup: 'back', equipment: 'barbell' },
    }),
  )
  const { workout } = await ok(
    await coach.post('/api/workouts', {
      data: {
        name: names.workout,
        exercises: [{ exerciseId: exercise.id, targetSets: 2, targetRepsMin: 5, targetRepsMax: 5 }],
      },
    }),
  )
  const { program } = await ok(
    await coach.post('/api/programs', {
      data: {
        name: names.program,
        durationWeeks: 1,
        days: [1, 2, 3, 4, 5, 6, 7].map((dayNumber) => ({
          weekNumber: 1,
          dayNumber,
          workoutId: workout.id,
        })),
      },
    }),
  )
  const email = `e2e-lee-${stamp}@${E2E_DOMAIN}`
  await ok(
    await coach.post('/api/admin/users', {
      data: {
        name: names.client,
        email,
        password: 'temporary-password-1',
        program: { programId: program.id, startDate: todayIn('Africa/Johannesburg') },
      },
    }),
  )
  await coach.dispose()

  // The client, on the phone app: first sign-in, then today's workout, two sets, finished.
  const phone = await request.newContext({
    baseURL: APP_URL,
    extraHTTPHeaders: { origin: APP_URL },
  })
  await ok(
    await phone.post('/api/auth/sign-in/email', {
      data: { email, password: 'temporary-password-1' },
    }),
  )
  await ok(await phone.post('/api/me/first-password', { data: { password: 'my-own-password-1' } }))
  const { plan } = await ok(await phone.get('/api/me/plan'))
  const today = plan.days.find((d: Json) => d.date === todayIn('Africa/Johannesburg'))
  const { session } = await ok(
    await phone.post('/api/sessions', {
      data: {
        clientUuid: crypto.randomUUID(),
        workoutId: today.workoutId,
        enrollmentId: plan.enrollment.id,
        programDayId: today.programDayId,
      },
    }),
  )
  for (const [setNumber, weightKg] of [
    [1, 100],
    [2, 110],
  ]) {
    await ok(
      await phone.put(`/api/sessions/${session.id}/sets`, {
        data: {
          clientUuid: crypto.randomUUID(),
          exerciseId: exercise.id,
          setNumber,
          weightKg,
          reps: 5,
        },
      }),
    )
  }
  await ok(await phone.post(`/api/sessions/${session.id}/finish`, { data: { feeling: 5 } }))

  // Overview lists it under Latest workouts; it opens set by set in a side panel.
  await page.goto('/')
  await page
    .getByRole('button', { name: new RegExp(`^E ${names.client} · ${names.workout}`) })
    .click()
  const review = page.getByRole('dialog', { name: 'E2E’s workout' })
  await expect(review.getByRole('definition').filter({ hasText: '1 050 kg' })).toBeVisible()
  await expect(review.getByRole('row', { name: '1 5 reps 100 kg × 5' })).toBeVisible()
  await expect(review.getByRole('row', { name: '2 5 reps 110 kg × 5' })).toBeVisible()

  // The first Comment is the whole workout's (each exercise has its own below).
  await review.getByRole('button', { name: 'Comment' }).first().click()
  const box = review.getByRole('textbox', { name: 'Comment on this workout' })
  const send = review.getByRole('button', { name: 'Send' })
  await expect(send).toBeDisabled()
  await box.fill('Strong pulls, Lee. Same weight next week.')
  await send.click()
  await expect(review.getByText('Strong pulls, Lee. Same weight next week.')).toBeVisible()
  await review.getByRole('button', { name: 'Like' }).first().click()

  // The client sees both on that workout.
  await expect
    .poll(async () => {
      const { feedback } = await ok(await phone.get(`/api/sessions/${session.id}/feedback`))
      return (feedback as Json[]).map((f) => `${f.kind}: ${f.body ?? ''}`).sort()
    })
    .toEqual(['comment: Strong pulls, Lee. Same weight next week.', 'like: '])
  await phone.dispose()
})
