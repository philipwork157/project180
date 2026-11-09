import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, setupHousehold, signIn } from './helpers'

interface ExerciseBody {
  exercise: { id: number; name: string; createdBy: number }
}
interface ListBody {
  exercises: Array<{ id: number; name: string }>
}

const squat = { name: 'Barbell Squat', muscleGroup: 'legs', equipment: 'barbell' }

describe('exercises', () => {
  it('creates an exercise with defaults', async () => {
    const { admin } = await setupHousehold()
    const res = await call<ExerciseBody>('/exercises', {
      method: 'POST',
      cookie: admin,
      body: squat,
    })
    expect(res.status).toBe(201)
    expect(res.data.exercise).toMatchObject({ name: 'Barbell Squat' })
  })

  it('validates input', async () => {
    const { admin } = await setupHousehold()
    const res = await call('/exercises', {
      method: 'POST',
      cookie: admin,
      body: { name: '', muscleGroup: 'legs' },
    })
    expect(res.status).toBe(400)
  })

  it('archives instead of deleting, hiding it from the list', async () => {
    const { admin } = await setupHousehold()
    const created = await call<ExerciseBody>('/exercises', {
      method: 'POST',
      cookie: admin,
      body: squat,
    })
    const del = await call(`/exercises/${created.data.exercise.id}`, {
      method: 'DELETE',
      cookie: admin,
    })
    expect(del.status).toBe(204)
    const list = await call<ListBody>('/exercises', { cookie: admin })
    expect(list.data.exercises).toHaveLength(0)
  })
})

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }

/** The owner and a coach the owner added. */
async function ownerAndCoach() {
  await createAdmin()
  const owner = await signIn(ADMIN.email, ADMIN.password)
  await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
  const coach = await signIn(COACH.email, COACH.password)
  return { owner, coach }
}

describe('who sees the library', () => {
  it('is for staff only: clients never see or change it', async () => {
    const { admin, member } = await setupHousehold()
    const created = await call<ExerciseBody>('/exercises', {
      method: 'POST',
      cookie: admin,
      body: squat,
    })
    const id = created.data.exercise.id
    expect((await call('/exercises', { cookie: member })).status).toBe(403)
    expect((await call(`/exercises/${id}`, { cookie: member })).status).toBe(403)
    expect((await call('/exercises', { method: 'POST', cookie: member, body: squat })).status).toBe(
      403,
    )
    expect((await call('/workouts', { cookie: member })).status).toBe(403)
    expect((await call('/programs', { cookie: member })).status).toBe(403)
  })

  it('every coach sees every exercise, but only its creator or an owner changes it', async () => {
    const { owner, coach } = await ownerAndCoach()
    const created = await call<ExerciseBody>('/exercises', {
      method: 'POST',
      cookie: owner,
      body: squat,
    })
    const id = created.data.exercise.id
    const list = await call<ListBody>('/exercises', { cookie: coach })
    expect(list.data.exercises.map((e) => e.name)).toContain('Barbell Squat')
    expect(
      (
        await call(`/exercises/${id}`, {
          method: 'PATCH',
          cookie: coach,
          body: { name: 'Hijacked' },
        })
      ).status,
    ).toBe(403)
    expect(
      (await call(`/exercises/${id}/permanent`, { method: 'DELETE', cookie: coach })).status,
    ).toBe(403)

    const mine = await call<ExerciseBody>('/exercises', {
      method: 'POST',
      cookie: coach,
      body: { ...squat, name: 'Front Squat' },
    })
    const edit = await call<ExerciseBody>(`/exercises/${mine.data.exercise.id}`, {
      method: 'PATCH',
      cookie: owner,
      body: { name: 'Front Squat (high bar)' },
    })
    expect(edit.status).toBe(200)
    expect(edit.data.exercise.name).toBe('Front Squat (high bar)')
  })

  it('workouts and programs: their creator and the owners see them, other coaches don’t', async () => {
    const { owner, coach } = await ownerAndCoach()
    const ex = await call<ExerciseBody>('/exercises', {
      method: 'POST',
      cookie: owner,
      body: squat,
    })
    const ownerWorkout = await call<{ workout: { id: number } }>('/workouts', {
      method: 'POST',
      cookie: owner,
      body: { name: 'Owner legs', exercises: [{ exerciseId: ex.data.exercise.id }] },
    })
    const coachWorkout = await call<{ workout: { id: number } }>('/workouts', {
      method: 'POST',
      cookie: coach,
      body: { name: 'Coach legs', exercises: [{ exerciseId: ex.data.exercise.id }] },
    })
    const coachProgram = await call<{ program: { id: number } }>('/programs', {
      method: 'POST',
      cookie: coach,
      body: { name: 'Coach plan', durationWeeks: 1 },
    })
    const names = async (cookie: string, path: string, key: string) =>
      ((await call<Record<string, Array<{ name: string }>>>(path, { cookie })).data[key] ?? [])
        .map((x) => x.name)
        .sort()

    expect(await names(coach, '/workouts', 'workouts')).toEqual(['Coach legs'])
    expect(await names(owner, '/workouts', 'workouts')).toEqual(['Coach legs', 'Owner legs'])
    expect(await names(owner, '/programs', 'programs')).toEqual(['Coach plan'])
    expect(
      (await call(`/workouts/${ownerWorkout.data.workout.id}`, { cookie: coach })).status,
    ).toBe(404)
    expect(
      (await call(`/workouts/${coachWorkout.data.workout.id}`, { cookie: owner })).status,
    ).toBe(200)
    expect(
      (await call(`/programs/${coachProgram.data.program.id}`, { cookie: owner })).status,
    ).toBe(200)
  })

  it('requires sign-in', async () => {
    expect((await call('/exercises')).status).toBe(401)
  })
})

describe('deleting exercises', () => {
  it('deletes an unused exercise for good', async () => {
    const { admin } = await setupHousehold()
    const created = await call<ExerciseBody>('/exercises', {
      method: 'POST',
      cookie: admin,
      body: squat,
    })
    const id = created.data.exercise.id
    const usage = await call<{ usage: { workouts: unknown[]; loggedSets: number } }>(
      `/exercises/${id}/usage`,
      {
        cookie: admin,
      },
    )
    expect(usage.data.usage).toEqual({ workouts: [], loggedSets: 0 })
    expect(
      (await call(`/exercises/${id}/permanent`, { method: 'DELETE', cookie: admin })).status,
    ).toBe(204)
    expect((await call(`/exercises/${id}`, { cookie: admin })).status).toBe(404)
  })

  it('refuses to delete an exercise a workout uses', async () => {
    const { admin } = await setupHousehold()
    const created = await call<ExerciseBody>('/exercises', {
      method: 'POST',
      cookie: admin,
      body: squat,
    })
    const id = created.data.exercise.id
    await call('/workouts', {
      method: 'POST',
      cookie: admin,
      body: { name: 'Leg Day', exercises: [{ exerciseId: id }] },
    })
    const res = await call<{ error: string }>(`/exercises/${id}/permanent`, {
      method: 'DELETE',
      cookie: admin,
    })
    expect(res.status).toBe(409)
    expect(res.data.error).toContain('1 workout')
  })
})
