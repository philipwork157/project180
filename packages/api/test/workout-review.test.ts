import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, signIn } from './helpers'

type Json = Record<string, any>

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }
const CLIENT = { name: 'Client Sam', email: 'sam@example.com', password: 'client-password-1' }
const OTHER = { name: 'Client Lee', email: 'lee@example.com', password: 'client-password-2' }

/** Owner, coach Kim with clients Sam and Lee, and the owner's own client (MEMBER). */
async function team() {
  await createAdmin()
  const owner = await signIn(ADMIN.email, ADMIN.password)
  await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
  const coach = await signIn(COACH.email, COACH.password)
  await call('/admin/users', { method: 'POST', cookie: owner, body: MEMBER })
  await call('/admin/users', { method: 'POST', cookie: coach, body: CLIENT })
  await call('/admin/users', { method: 'POST', cookie: coach, body: OTHER })
  const people = (await call<Json>('/admin/users', { cookie: owner })).data.users as Json[]
  const idOf = (email: string) => people.find((u) => u.email === email)?.id as number
  const ex = await call<Json>('/exercises', {
    method: 'POST',
    cookie: coach,
    body: { name: 'Squat', muscleGroup: 'legs' },
  })
  const w = await call<Json>('/workouts', {
    method: 'POST',
    cookie: coach,
    body: {
      name: 'Legs',
      exercises: [
        {
          exerciseId: ex.data.exercise.id,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 10,
          restSeconds: 90,
        },
      ],
    },
  })
  const p = await call<Json>('/programs', {
    method: 'POST',
    cookie: coach,
    body: {
      name: 'Base',
      durationWeeks: 1,
      days: [{ weekNumber: 1, dayNumber: 1, workoutId: w.data.workout.id }],
    },
  })
  for (const email of [CLIENT.email, OTHER.email]) {
    await call('/enrollments', {
      method: 'POST',
      cookie: coach,
      body: { userId: idOf(email), programId: p.data.program.id, startDate: '2026-11-09' },
    })
  }
  return { owner, coach, idOf, exerciseId: ex.data.exercise.id as number }
}

/** Sign in as a client, start today's workout and log one set. */
async function startWorkout(person: { email: string; password: string }, exerciseId: number) {
  const cookie = await signIn(person.email, person.password)
  const plan = await call<Json>('/me/plan', { cookie })
  const s = await call<Json>('/sessions', {
    method: 'POST',
    cookie,
    body: { clientUuid: crypto.randomUUID(), workoutId: plan.data.plan.days[0].workoutId },
  })
  await call(`/sessions/${s.data.session.id}/sets`, {
    method: 'PUT',
    cookie,
    body: { clientUuid: crypto.randomUUID(), exerciseId, setNumber: 1, weightKg: 60, reps: 8 },
  })
  return { cookie, sessionId: s.data.session.id as number }
}

describe('coach sees a client’s workout', () => {
  it('shows planned vs done, live while training and after finishing', async () => {
    const { coach, owner, idOf, exerciseId } = await team()
    const sam = idOf(CLIENT.email)
    const { cookie, sessionId } = await startWorkout(CLIENT, exerciseId)

    // Training now: on the overview and readable set by set.
    const overview = await call<Json>('/admin/overview', { cookie: coach })
    expect(overview.data.overview.live).toHaveLength(1)
    expect(overview.data.overview.live[0]).toMatchObject({
      id: sessionId,
      userId: sam,
      setCount: 1,
    })
    const live = await call<Json>(`/admin/users/${sam}/workouts/${sessionId}`, { cookie: coach })
    expect(live.status).toBe(200)
    expect(live.data.session.status).toBe('in_progress')
    expect(live.data.session.exercises[0]).toMatchObject({ exerciseName: 'Squat', targetSets: 3 })
    expect(live.data.session.sets).toHaveLength(1)

    await call(`/sessions/${sessionId}/finish`, { method: 'POST', cookie, body: { feeling: 4 } })
    const after = await call<Json>('/admin/overview', { cookie: coach })
    expect(after.data.overview.live).toHaveLength(0)
    expect(after.data.overview.recent[0]).toMatchObject({ id: sessionId, userId: sam })
    const done = await call<Json>(`/admin/users/${sam}/workouts/${sessionId}`, { cookie: coach })
    expect(done.data.session).toMatchObject({ status: 'completed', feeling: 4 })

    // Workouts stay between a client and their own coach: an owner who isn't Sam's coach gets 404.
    expect(
      (await call(`/admin/users/${sam}/workouts/${sessionId}`, { cookie: owner })).status,
    ).toBe(404)
  })

  it('nobody else can read it', async () => {
    const { coach, idOf, exerciseId } = await team()
    const sam = idOf(CLIENT.email)
    const lee = idOf(OTHER.email)
    const wife = idOf(MEMBER.email)
    const { sessionId } = await startWorkout(CLIENT, exerciseId)

    // Another client: no admin routes at all, and no reading Sam's session directly.
    const leeCookie = await signIn(OTHER.email, OTHER.password)
    expect(
      (await call(`/admin/users/${sam}/workouts/${sessionId}`, { cookie: leeCookie })).status,
    ).toBe(403)
    expect((await call(`/sessions/${sessionId}`, { cookie: leeCookie })).status).toBe(404)

    // The coach can't reach it through another person's id (even their own client's).
    expect(
      (await call(`/admin/users/${lee}/workouts/${sessionId}`, { cookie: coach })).status,
    ).toBe(404)

    // A coach who doesn't look after Sam gets 404, and Sam never shows on their overview.
    const owner = await signIn(ADMIN.email, ADMIN.password)
    const other = { name: 'Coach Max', email: 'max@example.com', password: 'coach-password-2' }
    await call('/admin/users', { method: 'POST', cookie: owner, body: { ...other, role: 'admin' } })
    const max = await signIn(other.email, other.password)
    expect((await call(`/admin/users/${sam}/workouts/${sessionId}`, { cookie: max })).status).toBe(
      404,
    )
    const maxOverview = await call<Json>('/admin/overview', { cookie: max })
    expect(maxOverview.data.overview.live).toHaveLength(0)
    expect(maxOverview.data.overview.recent).toHaveLength(0)

    // Kim doesn't coach the owner's client.
    expect((await call(`/admin/users/${wife}/workouts/1`, { cookie: coach })).status).toBe(404)
  })

  it('coach likes and comments; only the client sees them, and only on their own workout', async () => {
    const { coach, idOf, exerciseId } = await team()
    const sam = idOf(CLIENT.email)
    const lee = idOf(OTHER.email)
    const { cookie: samCookie, sessionId } = await startWorkout(CLIENT, exerciseId)
    const base = `/admin/users/${sam}/workouts/${sessionId}/feedback`

    const like = await call<Json>(base, {
      method: 'POST',
      cookie: coach,
      body: { exerciseId, kind: 'like' },
    })
    expect(like.status).toBe(201)
    // Liking again keeps the one like.
    const again = await call<Json>(base, {
      method: 'POST',
      cookie: coach,
      body: { exerciseId, kind: 'like' },
    })
    expect(again.data.feedback.id).toBe(like.data.feedback.id)
    await call(base, { method: 'POST', cookie: coach, body: { kind: 'like' } })
    const comment = await call<Json>(base, {
      method: 'POST',
      cookie: coach,
      body: { kind: 'comment', body: 'Great depth!' },
    })
    expect(comment.data.feedback).toMatchObject({ exerciseId: null, authorName: COACH.name })
    // A comment needs words; an exercise must be in this workout.
    expect(
      (await call(base, { method: 'POST', cookie: coach, body: { kind: 'comment' } })).status,
    ).toBe(400)
    expect(
      (
        await call(base, {
          method: 'POST',
          cookie: coach,
          body: { exerciseId: 99999, kind: 'like' },
        })
      ).status,
    ).toBe(404)

    const coachView = await call<Json>(`/admin/users/${sam}/workouts/${sessionId}`, {
      cookie: coach,
    })
    expect(coachView.data.feedback).toHaveLength(3)

    // Sam sees all three as unread, on the workout and in notifications.
    const onWorkout = await call<Json>(`/sessions/${sessionId}/feedback`, { cookie: samCookie })
    expect(onWorkout.data.feedback).toHaveLength(3)
    const unread = await call<Json>('/me/feedback', { cookie: samCookie })
    expect(unread.data.feedback).toHaveLength(3)
    expect(unread.data.feedback[0]).toMatchObject({ workoutName: 'Legs', body: 'Great depth!' })

    // Lee sees nothing of it and can't read or mark it.
    const leeCookie = await signIn(OTHER.email, OTHER.password)
    expect((await call<Json>('/me/feedback', { cookie: leeCookie })).data.feedback).toEqual([])
    expect((await call(`/sessions/${sessionId}/feedback`, { cookie: leeCookie })).status).toBe(404)
    const ids = unread.data.feedback.map((f: Json) => f.id)
    const leeRead = await call<Json>('/me/feedback/read', {
      method: 'POST',
      cookie: leeCookie,
      body: { ids },
    })
    expect(leeRead.data.read).toBe(0)
    // Clients can't leave feedback, and the coach can't put it on someone else's workout.
    expect(
      (await call(base, { method: 'POST', cookie: leeCookie, body: { kind: 'like' } })).status,
    ).toBe(403)
    expect(
      (
        await call(`/admin/users/${lee}/workouts/${sessionId}/feedback`, {
          method: 'POST',
          cookie: coach,
          body: { kind: 'like' },
        })
      ).status,
    ).toBe(404)

    // Sam opens the workout: all read, nothing left in notifications, the coach sees it was seen.
    const read = await call<Json>('/me/feedback/read', {
      method: 'POST',
      cookie: samCookie,
      body: { ids },
    })
    expect(read.data.read).toBe(3)
    expect((await call<Json>('/me/feedback', { cookie: samCookie })).data.feedback).toEqual([])
    const seen = await call<Json>(`/admin/users/${sam}/workouts/${sessionId}`, { cookie: coach })
    expect(seen.data.feedback.every((f: Json) => f.readAt !== null)).toBe(true)
  })

  it('a coach can only take back their own feedback', async () => {
    const { coach, owner, idOf, exerciseId } = await team()
    const sam = idOf(CLIENT.email)
    const { cookie: samCookie, sessionId } = await startWorkout(CLIENT, exerciseId)
    const base = `/admin/users/${sam}/workouts/${sessionId}/feedback`
    const mine = await call<Json>(base, {
      method: 'POST',
      cookie: coach,
      body: { kind: 'comment', body: 'Nice' },
    })
    const id = mine.data.feedback.id
    // The owner can see Sam, but it isn't the owner's comment to delete.
    expect((await call(`${base}/${id}`, { method: 'DELETE', cookie: owner })).status).toBe(404)
    expect((await call(`${base}/${id}`, { method: 'DELETE', cookie: coach })).status).toBe(204)
    expect((await call<Json>('/me/feedback', { cookie: samCookie })).data.feedback).toEqual([])
  })
})
