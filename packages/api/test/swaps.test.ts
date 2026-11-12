import { describe, expect, it } from 'vitest'
import { call, MEMBER, setupHousehold, signIn } from './helpers'

type Json = Record<string, any>

const OTHER = { name: 'Other Client', email: 'other@example.com', password: 'other-password-1' }

async function exercise(admin: string, name: string, equipment = 'barbell') {
  const res = await call<Json>('/exercises', {
    method: 'POST',
    cookie: admin,
    body: { name, muscleGroup: 'legs', equipment },
  })
  return res.data.exercise.id as number
}

/** A member on a program with Squat (4 × 12·10·10·8) then Lunge, and a workout started. */
async function started() {
  const { admin, member } = await setupHousehold()
  const squat = await exercise(admin, 'Squat')
  const lunge = await exercise(admin, 'Lunge', 'dumbbell')
  const press = await exercise(admin, 'Leg Press', 'machine')
  const goblet = await exercise(admin, 'Goblet Squat', 'dumbbell')
  const workout = await call<Json>('/workouts', {
    method: 'POST',
    cookie: admin,
    body: {
      name: 'Legs',
      exercises: [
        { exerciseId: squat, targetRepsPerSet: [12, 10, 10, 8] },
        { exerciseId: lunge, targetSets: 3, targetRepsMin: 10, targetRepsMax: 10 },
      ],
    },
  })
  const program = await call<Json>('/programs', {
    method: 'POST',
    cookie: admin,
    body: {
      name: 'P',
      durationWeeks: 1,
      days: [{ weekNumber: 1, dayNumber: 1, workoutId: workout.data.workout.id }],
    },
  })
  const users = await call<Json>('/admin/users', { cookie: admin })
  const userId = users.data.users.find((u: Json) => u.email === MEMBER.email).id
  await call('/enrollments', {
    method: 'POST',
    cookie: admin,
    body: { userId, programId: program.data.program.id, startDate: '2026-11-02' },
  })
  const plan = await call<Json>('/me/plan', { cookie: member })
  const day = plan.data.plan.days.find((d: Json) => d.workoutId !== null)
  const s = await call<Json>('/sessions', {
    method: 'POST',
    cookie: member,
    body: {
      clientUuid: crypto.randomUUID(),
      workoutId: day.workoutId,
      programDayId: day.programDayId,
    },
  })
  return { admin, member, userId, squat, lunge, press, goblet, sessionId: s.data.session.id }
}

const logSet = (cookie: string, sessionId: number, exerciseId: number, setNumber: number) =>
  call(`/sessions/${sessionId}/sets`, {
    method: 'PUT',
    cookie,
    body: { clientUuid: crypto.randomUUID(), exerciseId, setNumber, weightKg: 60, reps: 10 },
  })

const swap = (cookie: string, sessionId: number, exerciseId: number, replacementId: number) =>
  call<Json>(`/sessions/${sessionId}/swap`, {
    method: 'POST',
    cookie,
    body: { exerciseId, replacementId },
  })

describe('coach alternatives', () => {
  it('only staff can see or set them; clients get them through swap options', async () => {
    const { admin, member, squat, press, goblet } = await started()
    const put = await call<Json>(`/exercises/${squat}/alternatives`, {
      method: 'PUT',
      cookie: admin,
      body: { alternativeIds: [goblet, press] },
    })
    expect(put.data.alternativeIds).toEqual([goblet, press])
    expect((await call(`/exercises/${squat}/alternatives`, { cookie: member })).status).toBe(403)
    expect(
      (
        await call(`/exercises/${squat}/alternatives`, {
          method: 'PUT',
          cookie: member,
          body: { alternativeIds: [] },
        })
      ).status,
    ).toBe(403)
    const options = await call<Json>('/sessions/swap-options', { cookie: member })
    expect(options.data.coach[squat]).toEqual([goblet, press])
    expect(options.data.exercises.map((e: Json) => e.name)).toContain('Leg Press')
  })

  it('leaves out archived alternatives and refuses unknown ones', async () => {
    const { admin, squat, press, goblet } = await started()
    await call(`/exercises/${squat}/alternatives`, {
      method: 'PUT',
      cookie: admin,
      body: { alternativeIds: [press, goblet] },
    })
    await call(`/exercises/${press}`, { method: 'DELETE', cookie: admin })
    const list = await call<Json>(`/exercises/${squat}/alternatives`, { cookie: admin })
    expect(list.data.alternativeIds).toEqual([goblet])
    const bad = await call(`/exercises/${squat}/alternatives`, {
      method: 'PUT',
      cookie: admin,
      body: { alternativeIds: [999_999] },
    })
    expect(bad.status).toBe(404)
  })
})

describe('swapping an exercise mid-workout', () => {
  it('replaces it before any set is logged, keeping the targets, and swaps back', async () => {
    const { member, sessionId, squat, press } = await started()
    const res = await swap(member, sessionId, squat, press)
    expect(res.status).toBe(200)
    const first = res.data.session.exercises[0]
    expect(first).toMatchObject({
      exerciseId: press,
      exerciseName: 'Leg Press',
      targetSets: 4,
      targetRepsPerSet: [12, 10, 10, 8],
      swappedFrom: { exerciseId: squat, exerciseName: 'Squat' },
    })
    const back = await swap(member, sessionId, press, squat)
    expect(back.data.session.exercises[0]).toMatchObject({ exerciseId: squat, swappedFrom: null })
  })

  it('keeps logged sets on the original and moves the rest to the replacement', async () => {
    const { member, sessionId, squat, lunge, press } = await started()
    await logSet(member, sessionId, squat, 1)
    const res = await swap(member, sessionId, squat, press)
    const items = res.data.session.exercises
    expect(items.map((e: Json) => e.exerciseId)).toEqual([squat, press, lunge])
    expect(items[0]).toMatchObject({ targetSets: 1, targetRepsPerSet: [12], swappedFrom: null })
    expect(items[1]).toMatchObject({
      targetSets: 3,
      targetRepsPerSet: [10, 10, 8],
      swappedFrom: { exerciseId: squat },
    })
    expect(res.data.session.sets).toHaveLength(1)

    // Changed their mind before logging on the leg press: the sets go back to squats.
    const undo = await swap(member, sessionId, press, squat)
    expect(undo.data.session.exercises.map((e: Json) => e.exerciseId)).toEqual([squat, lunge])
    expect(undo.data.session.exercises[0]).toMatchObject({
      targetSets: 4,
      targetRepsPerSet: [12, 10, 10, 8],
    })
  })

  it('shows the swap in history and remembers it for next time', async () => {
    const { admin, member, userId, sessionId, squat, press } = await started()
    await swap(member, sessionId, squat, press)
    await logSet(member, sessionId, press, 1)
    await call(`/sessions/${sessionId}/finish`, { method: 'POST', cookie: member, body: {} })

    const progress = await call<Json>(`/admin/users/${userId}/progress`, { cookie: admin })
    expect(progress.data.progress.recent[0].swaps).toEqual([{ from: 'Squat', to: 'Leg Press' }])
    const options = await call<Json>('/sessions/swap-options', { cookie: member })
    expect(options.data.mine[squat]).toEqual([press])
  })

  it('refuses an exercise already in the workout, and finished workouts', async () => {
    const { member, sessionId, squat, lunge, press } = await started()
    expect((await swap(member, sessionId, squat, lunge)).status).toBe(409)
    await call(`/sessions/${sessionId}/finish`, { method: 'POST', cookie: member, body: {} })
    expect((await swap(member, sessionId, squat, press)).status).toBe(409)
  })

  it('is private: nobody else can swap in your workout or see your past swaps', async () => {
    const { admin, member, sessionId, squat, press } = await started()
    await swap(member, sessionId, squat, press)
    await call('/admin/users', { method: 'POST', cookie: admin, body: OTHER })
    const other = await signIn(OTHER.email, OTHER.password)
    expect((await swap(other, sessionId, press, squat)).status).toBe(404)
    // The owner (staff) can't either: sessions are only ever your own.
    expect((await swap(admin, sessionId, press, squat)).status).toBe(404)
    const options = await call<Json>('/sessions/swap-options', { cookie: other })
    expect(options.data.mine).toEqual({})
  })
})
