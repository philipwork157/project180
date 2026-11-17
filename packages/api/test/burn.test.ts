// Calories burned: activities and steps logged by hand, and finished workouts, added to the
// day on the food log. Only ever your own (a client's coach sees them on the Food card).

import { todayIn } from '@project180/shared'
import { describe, expect, it } from 'vitest'
import { call, setupHousehold } from './helpers'

type Json = Record<string, any>

const today = () => todayIn('Africa/Johannesburg')

async function weighIn(cookie: string, weightKg: number) {
  const res = await call('/me/checkins', {
    method: 'PUT',
    cookie,
    body: { clientUuid: crypto.randomUUID(), date: today(), weightKg },
  })
  expect(res.status).toBeLessThan(300)
}

const addActivity = (cookie: string, body: Json) =>
  call<Json>('/me/food/activities', {
    method: 'POST',
    cookie,
    body: { clientUuid: crypto.randomUUID(), date: today(), ...body },
  })

describe('activities and steps', () => {
  it('needs a weigh-in first', async () => {
    const { member } = await setupHousehold()
    const res = await addActivity(member, { kind: 'walk', minutes: 30 })
    expect(res.status).toBe(409)
  })

  it('adds an activity to the day, once per id, and deletes it', async () => {
    const { member } = await setupHousehold()
    await weighIn(member, 70)
    const clientUuid = crypto.randomUUID()
    const first = await addActivity(member, { clientUuid, kind: 'run', minutes: 30 })
    expect(first.status).toBe(201)
    // (9.8 - 1) x 70 kg x 0.5 h = 308
    expect(first.data.day.burned.kcal).toBe(308)
    expect(first.data.day.burned.activities).toHaveLength(1)
    const retry = await addActivity(member, { clientUuid, kind: 'run', minutes: 30 })
    expect(retry.data.day.burned.activities).toHaveLength(1)

    const id = first.data.day.burned.activities[0].id
    const gone = await call<Json>(`/me/food/activities/${id}`, { method: 'DELETE', cookie: member })
    expect(gone.data.day.burned.kcal).toBe(0)
  })

  it('counts steps above the everyday baseline; 0 clears them', async () => {
    const { member } = await setupHousehold()
    await weighIn(member, 80)
    const set = await call<Json>('/me/food/steps', {
      method: 'PUT',
      cookie: member,
      body: { date: today(), steps: 10_000 },
    })
    expect(set.data.day.burned).toMatchObject({ steps: 10_000, stepsKcal: 240, kcal: 240 })
    const cleared = await call<Json>('/me/food/steps', {
      method: 'PUT',
      cookie: member,
      body: { date: today(), steps: 0 },
    })
    expect(cleared.data.day.burned).toMatchObject({ steps: null, kcal: 0 })
  })

  it('refuses days ahead and bad input', async () => {
    const { member } = await setupHousehold()
    await weighIn(member, 70)
    expect(
      (await addActivity(member, { date: '2099-01-01', kind: 'walk', minutes: 30 })).status,
    ).toBe(400)
    expect((await addActivity(member, { kind: 'flying', minutes: 30 })).status).toBe(400)
    expect((await addActivity(member, { kind: 'walk', minutes: 0 })).status).toBe(400)
  })

  it('only ever touches your own', async () => {
    const { admin, member } = await setupHousehold()
    await weighIn(member, 70)
    const mine = await addActivity(member, { kind: 'walk', minutes: 30 })
    const id = mine.data.day.burned.activities[0].id
    // Someone else can't delete it, and never sees it.
    expect(
      (await call(`/me/food/activities/${id}`, { method: 'DELETE', cookie: admin })).status,
    ).toBe(404)
    const theirs = (await call<Json>('/me/food', { cookie: admin })).data.day.burned
    expect(theirs.activities.every((a: Json) => a.id !== id)).toBe(true)
  })

  it('shows on the coach’s view of the client’s day', async () => {
    const { admin, member } = await setupHousehold()
    await weighIn(member, 70)
    await addActivity(member, { kind: 'padel', minutes: 60 })
    const id = (await call<Json>('/me', { cookie: member })).data.user.id
    const day = (await call<Json>(`/admin/users/${id}/food`, { cookie: admin })).data.day
    expect(day.burned.kcal).toBe(350)
    const summary = (
      await call<Json>(`/admin/users/${id}/food/summary?from=${today()}&to=${today()}`, {
        cookie: admin,
      })
    ).data.summary
    expect(summary.burned).toEqual([{ date: today(), kcal: 350 }])
  })
})

describe('workouts', () => {
  it('a finished workout adds its estimate to the day', async () => {
    const { admin } = await setupHousehold()
    await weighIn(admin, 80)
    const ex = await call<Json>('/exercises', {
      method: 'POST',
      cookie: admin,
      body: { name: 'Burn squat', muscleGroup: 'legs' },
    })
    const w = await call<Json>('/workouts', {
      method: 'POST',
      cookie: admin,
      body: { name: 'Legs', exercises: [{ exerciseId: ex.data.exercise.id, targetSets: 3 }] },
    })
    const started = await call<Json>('/sessions', {
      method: 'POST',
      cookie: admin,
      body: { clientUuid: crypto.randomUUID(), workoutId: w.data.workout.id },
    })
    expect(started.status).toBeLessThan(300)
    const id = started.data.session.id
    for (const setNumber of [1, 2, 3])
      await call(`/sessions/${id}/sets`, {
        method: 'PUT',
        cookie: admin,
        body: {
          clientUuid: crypto.randomUUID(),
          exerciseId: ex.data.exercise.id,
          setNumber,
          weightKg: 60,
          reps: 8,
        },
      })
    await call(`/sessions/${id}/finish`, { method: 'POST', cookie: admin, body: { feeling: 4 } })
    const burned = (await call<Json>('/me/food', { cookie: admin })).data.day.burned
    expect(burned.workouts).toHaveLength(1)
    expect(burned.workouts[0]).toMatchObject({ sessionId: id, name: 'Legs' })
    expect(burned.workouts[0].kcal).toBeGreaterThan(0)
    expect(burned.kcal).toBe(burned.workouts[0].kcal)
  })
})
