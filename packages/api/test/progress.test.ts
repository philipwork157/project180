import { describe, expect, it } from 'vitest'
import { ADMIN, call, MEMBER, setupHousehold, signIn } from './helpers'

type Json = Record<string, any>

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }

async function exercise(cookie: string, name: string) {
  const res = await call<Json>('/exercises', {
    method: 'POST',
    cookie,
    body: { name, muscleGroup: 'legs', equipment: 'barbell' },
  })
  return res.data.exercise.id as number
}

/** Owner's own workouts: squat at 40 then 45 kg, then a workout where squat became leg press. */
async function trained() {
  const { admin, member } = await setupHousehold()
  const squat = await exercise(admin, 'Squat')
  const press = await exercise(admin, 'Leg Press')
  const workout = await call<Json>('/workouts', {
    method: 'POST',
    cookie: admin,
    body: {
      name: 'Legs',
      exercises: [{ exerciseId: squat, targetSets: 2, targetRepsMin: 8, targetRepsMax: 8 }],
    },
  })
  async function session(exerciseId: number, weightKg: number, swapTo?: number) {
    const start = await call<Json>('/sessions', {
      method: 'POST',
      cookie: admin,
      body: { clientUuid: crypto.randomUUID(), workoutId: workout.data.workout.id },
    })
    const id = start.data.session.id
    if (swapTo !== undefined) {
      const swapped = await call(`/sessions/${id}/swap`, {
        method: 'POST',
        cookie: admin,
        body: { exerciseId, replacementId: swapTo },
      })
      expect(swapped.status).toBe(200)
    }
    await call(`/sessions/${id}/sets`, {
      method: 'PUT',
      cookie: admin,
      body: {
        clientUuid: crypto.randomUUID(),
        exerciseId: swapTo ?? exerciseId,
        setNumber: 1,
        weightKg,
        reps: 8,
      },
    })
    await call(`/sessions/${id}/finish`, { method: 'POST', cookie: admin, body: { feeling: 4 } })
  }
  await session(squat, 40)
  await session(squat, 45)
  await session(squat, 100, press)
  const people = (await call<Json>('/admin/users', { cookie: admin })).data.users as Json[]
  const ownerId = people.find((u) => u.email === ADMIN.email)?.id as number
  const memberId = people.find((u) => u.email === MEMBER.email)?.id as number
  return { admin, member, ownerId, memberId }
}

describe('progress for coaches', () => {
  it('shows strength per exercise over time, swaps and the phone numbers', async () => {
    const { admin, ownerId } = await trained()
    const res = await call<Json>(`/admin/users/${ownerId}/stats?weeks=4`, { cookie: admin })
    expect(res.status).toBe(200)
    const stats = res.data.stats
    expect(stats.workouts).toBe(3)
    expect(stats.weeks).toHaveLength(4)
    expect(stats.planned).toBeNull()
    const squat = stats.strength.find((s: Json) => s.exerciseName === 'Squat')
    expect(squat.points.map((p: Json) => p.bestWeightKg)).toEqual([40, 45])
    // Epley: 45 × (1 + 8/30) = 57
    expect(squat.points[1].oneRepMax).toBe(57)
    expect(stats.swaps).toMatchObject([{ fromName: 'Squat', toName: 'Leg Press', times: 1 }])
    // The phone's own numbers didn't change.
    const mine = await call<Json>('/me/stats', { cookie: admin })
    expect(mine.data.stats.workouts).toBe(3)
  })

  it('is for staff only, and only for people they look after', async () => {
    const { admin, member, ownerId, memberId } = await trained()
    expect((await call(`/admin/users/${ownerId}/stats`, { cookie: member })).status).toBe(403)
    await call('/admin/users', { method: 'POST', cookie: admin, body: { ...COACH, role: 'admin' } })
    const coach = await signIn(COACH.email, COACH.password)
    expect((await call(`/admin/users/${ownerId}/stats`, { cookie: coach })).status).toBe(404)
    expect((await call(`/admin/users/${memberId}/stats`, { cookie: coach })).status).toBe(404)
  })
})
