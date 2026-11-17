import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, setupHousehold, signIn } from './helpers'

type Json = Record<string, any>

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }
const OTHER = { name: 'Other Client', email: 'other@example.com', password: 'other-password-1' }

async function exercise(admin: string, name: string) {
  const res = await call<Json>('/exercises', {
    method: 'POST',
    cookie: admin,
    body: { name, muscleGroup: 'legs', equipment: 'barbell' },
  })
  return res.data.exercise.id as number
}

const quick = (cookie: string, body: Json) =>
  call<Json>('/sessions/quick', {
    method: 'POST',
    cookie,
    body: { clientUuid: crypto.randomUUID(), name: 'Quick · Legs', ...body },
  })

const allow = (cookie: string, userId: number, enabled: boolean) =>
  call<Json>(`/admin/users/${userId}/quick-workouts`, {
    method: 'PUT',
    cookie,
    body: { enabled },
  })

/** A client on a program with "Legs" (Squat, Lunge), plus a library workout they don't have. */
async function setup() {
  const { admin, member } = await setupHousehold()
  const squat = await exercise(admin, 'Squat')
  const lunge = await exercise(admin, 'Lunge')
  const legs = await call<Json>('/workouts', {
    method: 'POST',
    cookie: admin,
    body: {
      name: 'Legs',
      exercises: [
        { exerciseId: squat, targetRepsPerSet: [12, 10, 8] },
        { exerciseId: lunge, targetSets: 3, targetRepsMin: 10, targetRepsMax: 10 },
      ],
    },
  })
  await call('/workouts', {
    method: 'POST',
    cookie: admin,
    body: { name: 'Coach only', exercises: [{ exerciseId: squat }] },
  })
  const program = await call<Json>('/programs', {
    method: 'POST',
    cookie: admin,
    body: {
      name: 'P',
      durationWeeks: 1,
      days: [{ weekNumber: 1, dayNumber: 1, workoutId: legs.data.workout.id }],
    },
  })
  const users = await call<Json>('/admin/users', { cookie: admin })
  const userId = users.data.users.find((u: Json) => u.email === MEMBER.email).id as number
  await call('/enrollments', {
    method: 'POST',
    cookie: admin,
    body: { userId, programId: program.data.program.id, startDate: '2026-11-02' },
  })
  return { admin, member, userId, squat, lunge }
}

describe('quick workouts', () => {
  it('stay off for a client until their coach turns them on', async () => {
    const { admin, member, userId, squat } = await setup()
    expect((await call<Json>('/me/plan', { cookie: member })).data.quickWorkouts).toBe(false)
    expect((await call<Json>('/sessions/quick', { cookie: member })).data).toEqual({
      enabled: false,
      workouts: [],
    })
    expect((await quick(member, { exercises: [{ exerciseId: squat }] })).status).toBe(403)

    const on = await allow(admin, userId, true)
    expect(on.data.quickWorkouts).toEqual({ enabled: true, always: false })
    expect((await call<Json>('/me/plan', { cookie: member })).data.quickWorkouts).toBe(true)
    const seen = await call<Json>(`/admin/users/${userId}/quick-workouts`, { cookie: admin })
    expect(seen.data.quickWorkouts.enabled).toBe(true)

    await allow(admin, userId, false)
    expect((await quick(member, { exercises: [{ exerciseId: squat }] })).status).toBe(403)
  })

  it('offers only their own workouts and starts one they built', async () => {
    const { admin, member, userId, squat, lunge } = await setup()
    await allow(admin, userId, true)
    const options = await call<Json>('/sessions/quick', { cookie: member })
    // Their copy of "Legs", never the coach's library.
    expect(options.data.workouts.map((w: Json) => w.name)).toEqual(['Legs'])
    const source = options.data.workouts[0]
    expect(source.exercises).toHaveLength(2)

    const clientUuid = crypto.randomUUID()
    const body = {
      clientUuid,
      name: 'Quick · Legs',
      sourceWorkoutId: source.id,
      exercises: [
        { exerciseId: lunge, targetSets: 4, targetRepsMin: 8, targetRepsMax: 8 },
        { exerciseId: squat, targetSets: 2, targetRepsMin: 5, targetRepsMax: 5 },
      ],
    }
    const started = await call<Json>('/sessions/quick', { method: 'POST', cookie: member, body })
    expect(started.status).toBe(201)
    const session = started.data.session
    expect(session.workoutName).toBe('Quick · Legs')
    expect(session.exercises.map((e: Json) => [e.exerciseId, e.targetSets])).toEqual([
      [lunge, 4],
      [squat, 2],
    ])

    // The phone retried: the same workout, not a second one.
    const again = await call<Json>('/sessions/quick', { method: 'POST', cookie: member, body })
    expect(again.status).toBe(200)
    expect(again.data.session.id).toBe(session.id)

    const plan = await call<Json>('/me/plan', { cookie: member })
    expect(plan.data.activeSession.id).toBe(session.id)
    // It's never a program day, so the program's progress doesn't move.
    expect(plan.data.plan.days.every((d: Json) => d.state !== 'done')).toBe(true)

    await call(`/sessions/${session.id}/sets`, {
      method: 'PUT',
      cookie: member,
      body: {
        clientUuid: crypto.randomUUID(),
        exerciseId: lunge,
        setNumber: 1,
        weightKg: 20,
        reps: 8,
      },
    })
    const finished = await call<Json>(`/sessions/${session.id}/finish`, {
      method: 'POST',
      cookie: member,
      body: { feeling: 4 },
    })
    expect(finished.status).toBe(200)
    const history = await call<Json>('/sessions', { cookie: member })
    expect(history.data.sessions[0]).toMatchObject({ id: session.id, quick: true })

    // The coach sees it, labelled, but it never lands in a library or the client's builder list.
    const stats = await call<Json>(`/admin/users/${userId}/stats`, { cookie: admin })
    expect(stats.data.stats.recent[0]).toMatchObject({ id: session.id, quick: true })
    const library = await call<Json>('/workouts', { cookie: admin })
    expect(library.data.workouts.map((w: Json) => w.name)).not.toContain('Quick · Legs')
    const theirs = await call<Json>(`/workouts?clientId=${userId}`, { cookie: admin })
    expect(theirs.data.workouts.map((w: Json) => w.name)).not.toContain('Quick · Legs')
    const after = await call<Json>('/sessions/quick', { cookie: member })
    expect(after.data.workouts.map((w: Json) => w.name)).toEqual(['Legs'])
  })

  it('keeps the order, supersets and timed cardio they built', async () => {
    const { admin, member, userId, squat, lunge } = await setup()
    await allow(admin, userId, true)
    const walk = await call<Json>('/exercises', {
      method: 'POST',
      cookie: admin,
      body: {
        name: 'Incline Walk',
        muscleGroup: 'cardio',
        equipment: 'machine',
        trackingType: 'time',
      },
    })
    const started = await quick(member, {
      exercises: [
        {
          exerciseId: lunge,
          targetSets: 4,
          targetRepsMin: 10,
          targetRepsMax: 10,
          supersetGroup: 1,
        },
        { exerciseId: squat, targetSets: 4, targetRepsMin: 8, targetRepsMax: 8, supersetGroup: 1 },
        { exerciseId: walk.data.exercise.id, targetSets: 1, targetSeconds: 45 * 60 },
      ],
      groups: [{ groupNumber: 1, kind: 'superset', rounds: 4, restSeconds: 60 }],
    })
    expect(started.status).toBe(201)
    const s = started.data.session
    expect(s.exercises.map((e: Json) => [e.exerciseId, e.supersetGroup])).toEqual([
      [lunge, 1],
      [squat, 1],
      [walk.data.exercise.id, null],
    ])
    expect(s.exercises[2].targetSeconds).toBe(2700)
    expect(s.groups).toEqual([
      { groupNumber: 1, kind: 'superset', rounds: 4, workSeconds: null, restSeconds: 60 },
    ])
  })

  it('refuses archived or unknown exercises', async () => {
    const { admin, member, userId, squat } = await setup()
    await allow(admin, userId, true)
    // In use in a workout, so deleting it archives it.
    await call(`/exercises/${squat}`, { method: 'DELETE', cookie: admin })
    expect((await quick(member, { exercises: [{ exerciseId: squat }] })).status).toBe(400)
    expect((await quick(member, { exercises: [{ exerciseId: 999_999 }] })).status).toBe(400)
    expect((await quick(member, { exercises: [] })).status).toBe(400)
  })

  it('lets staff always build their own, and only for themselves', async () => {
    const { admin, member, userId, squat } = await setup()
    const me = (await call<Json>('/me', { cookie: admin })).data.user
    expect((await call<Json>('/me/plan', { cookie: admin })).data.quickWorkouts).toBe(true)
    const options = await call<Json>('/sessions/quick', { cookie: admin })
    // Their own library workouts, never their client's copies.
    expect(options.data.workouts.map((w: Json) => w.name)).toEqual(['Coach only', 'Legs'])
    expect((await quick(admin, { exercises: [{ exerciseId: squat }] })).status).toBe(201)
    // There's no switch for staff.
    expect((await allow(admin, me.id, false)).status).toBe(403)
    // A client can't reach the switch, not even their own.
    expect((await allow(member, userId, true)).status).toBe(403)
  })
})

describe('quick workouts privacy', () => {
  it('never uses someone else’s workout, session id or switch', async () => {
    const { admin, member, userId, squat } = await setup()
    await allow(admin, userId, true)
    const theirCopy = (await call<Json>('/sessions/quick', { cookie: member })).data.workouts[0]

    const other = await call<Json>('/admin/users', { method: 'POST', cookie: admin, body: OTHER })
    const otherId = other.data.user.id as number
    const otherClient = await signIn(OTHER.email, OTHER.password)
    await allow(admin, otherId, true)
    // Another client's copy can't be the source, and isn't offered.
    expect((await call<Json>('/sessions/quick', { cookie: otherClient })).data.workouts).toEqual([])
    const borrowed = await quick(otherClient, {
      sourceWorkoutId: theirCopy.id,
      exercises: [{ exerciseId: squat }],
    })
    expect(borrowed.status).toBe(404)
    // Staff can't borrow a client's copy as a source either.
    expect(
      (await quick(admin, { sourceWorkoutId: theirCopy.id, exercises: [{ exerciseId: squat }] }))
        .status,
    ).toBe(404)

    // A session id someone else used: refused, never handed to the wrong person.
    const clientUuid = crypto.randomUUID()
    const body = { clientUuid, name: 'Quick', exercises: [{ exerciseId: squat }] }
    expect((await call('/sessions/quick', { method: 'POST', cookie: member, body })).status).toBe(
      201,
    )
    expect(
      (await call('/sessions/quick', { method: 'POST', cookie: otherClient, body })).status,
    ).toBe(409)
  })

  it('only the client’s own coach can see or change their switch', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
    const created = await call<Json>('/admin/users', {
      method: 'POST',
      cookie: owner,
      body: MEMBER,
    })
    const clientId = created.data.user.id as number
    const coach = await signIn(COACH.email, COACH.password)
    expect((await allow(coach, clientId, true)).status).toBe(404)
    expect((await call(`/admin/users/${clientId}/quick-workouts`, { cookie: coach })).status).toBe(
      404,
    )
    expect((await allow(owner, clientId, true)).status).toBe(200)
  })
})
