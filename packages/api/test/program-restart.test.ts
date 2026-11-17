// Restarting a past program from a date: pick up where they left off, start again keeping the
// old workouts in their history, or wipe them and start fresh. Plus what deleting one counts.

import { addDays, todayIn } from '@project180/shared'
import { describe, expect, it } from 'vitest'
import { call, MEMBER, setupHousehold } from './helpers'

type Json = Record<string, any>

const today = () => todayIn('Africa/Johannesburg')

/** A 3-week program with one workout on day 1 of each week. */
async function threeWeeks(cookie: string) {
  const ex = await call<Json>('/exercises', {
    method: 'POST',
    cookie,
    body: { name: 'Restart squat', muscleGroup: 'legs' },
  })
  const w = await call<Json>('/workouts', {
    method: 'POST',
    cookie,
    body: { name: 'Legs', exercises: [{ exerciseId: ex.data.exercise.id, targetSets: 3 }] },
  })
  const workoutId = w.data.workout.id
  const p = await call<Json>('/programs', {
    method: 'POST',
    cookie,
    body: {
      name: 'Three weeks',
      durationWeeks: 3,
      days: [1, 2, 3].map((weekNumber) => ({ weekNumber, dayNumber: 1, workoutId })),
    },
  })
  return { programId: p.data.program.id as number, exerciseId: ex.data.exercise.id as number }
}

async function household() {
  const { admin, member } = await setupHousehold()
  const people = (await call<Json>('/admin/users', { cookie: admin })).data.users as Json[]
  const memberId = people.find((u) => u.email === MEMBER.email)?.id as number
  const { programId, exerciseId } = await threeWeeks(admin)
  await call('/enrollments', {
    method: 'POST',
    cookie: admin,
    body: { userId: memberId, programId, startDate: today() },
  })
  return { admin, member, memberId, exerciseId }
}

/** Logs week 1's workout (with one set) and returns the session id. */
async function doWeekOne(member: string, exerciseId: number) {
  const plan = (await call<Json>('/me/plan', { cookie: member })).data.plan
  const day = plan.days.find((d: Json) => d.workoutId !== null && d.weekNumber === 1)
  const started = await call<Json>('/sessions', {
    method: 'POST',
    cookie: member,
    body: {
      clientUuid: crypto.randomUUID(),
      workoutId: day.workoutId,
      enrollmentId: plan.enrollment.id,
      programDayId: day.programDayId,
    },
  })
  const id = started.data.session.id as number
  await call(`/sessions/${id}/sets`, {
    method: 'PUT',
    cookie: member,
    body: { clientUuid: crypto.randomUUID(), exerciseId, setNumber: 1, weightKg: 40, reps: 8 },
  })
  await call(`/sessions/${id}/finish`, { method: 'POST', cookie: member, body: { feeling: 4 } })
  return id
}

const progress = async (admin: string, userId: number) =>
  (await call<Json>(`/admin/users/${userId}/progress`, { cookie: admin })).data as Json

async function archiveAndFindPast(admin: string, userId: number) {
  const archived = await call(`/admin/users/${userId}/program/archive`, {
    method: 'POST',
    cookie: admin,
  })
  expect(archived.status).toBe(204)
  const { past } = await progress(admin, userId)
  expect(past).toHaveLength(1)
  return past[0] as Json
}

const restart = (admin: string, userId: number, enrollmentId: number, body: Json) =>
  call<Json>(`/admin/users/${userId}/enrollments/${enrollmentId}/restart`, {
    method: 'POST',
    cookie: admin,
    body,
  })

describe('restarting a past program', () => {
  it('picks up where they left off: week 2 lands on the chosen day, history kept', async () => {
    const { admin, member, memberId, exerciseId } = await household()
    await doWeekOne(member, exerciseId)
    const past = await archiveAndFindPast(admin, memberId)
    expect(past.resumeWeek).toBe(2)

    const day = addDays(today(), 3)
    const res = await restart(admin, memberId, past.enrollmentId, {
      startDate: day,
      mode: 'continue',
    })
    expect(res.status).toBe(200)
    expect(res.data.startDate).toBe(addDays(day, -7))

    const { progress: p, past: after } = await progress(admin, memberId)
    expect(after).toHaveLength(0)
    expect(p.done).toBe(1)
    expect(p.impact.sessions).toBe(1)
    const week2 = p.plan.days.find((d: Json) => d.weekNumber === 2 && d.workoutId !== null)
    expect(week2.date).toBe(day)
  })

  it('starts again from week 1 keeping the old workout in history but off the calendar', async () => {
    const { admin, member, memberId, exerciseId } = await household()
    const sessionId = await doWeekOne(member, exerciseId)
    const past = await archiveAndFindPast(admin, memberId)

    const res = await restart(admin, memberId, past.enrollmentId, {
      startDate: today(),
      mode: 'again',
    })
    expect(res.data.startDate).toBe(today())
    const { progress: p } = await progress(admin, memberId)
    expect(p.done).toBe(0)
    expect(p.impact.sessions).toBe(1)
    const detail = await call(`/admin/users/${memberId}/workouts/${sessionId}`, { cookie: admin })
    expect(detail.status).toBe(200)
  })

  it('starts fresh: everything logged on it, likes and comments too, is deleted', async () => {
    const { admin, member, memberId, exerciseId } = await household()
    const sessionId = await doWeekOne(member, exerciseId)
    const feedback = `/admin/users/${memberId}/workouts/${sessionId}/feedback`
    await call(feedback, { method: 'POST', cookie: admin, body: { kind: 'like' } })
    await call(feedback, {
      method: 'POST',
      cookie: admin,
      body: { kind: 'comment', body: 'Nice!' },
    })
    const past = await archiveAndFindPast(admin, memberId)
    expect(past.impact).toEqual({ sessions: 1, loggedSets: 1, checkins: 0, likes: 1, comments: 1 })

    const res = await restart(admin, memberId, past.enrollmentId, {
      startDate: today(),
      mode: 'fresh',
    })
    expect(res.status).toBe(200)
    const { progress: p } = await progress(admin, memberId)
    expect(p.impact).toEqual({ sessions: 0, loggedSets: 0, checkins: 0, likes: 0, comments: 0 })
    const gone = await call(`/admin/users/${memberId}/workouts/${sessionId}`, { cookie: admin })
    expect(gone.status).toBe(404)
    const mine = (await call<Json>('/me/feedback', { cookie: member })).data
    expect(JSON.stringify(mine)).not.toContain('Nice!')
  })

  it('refuses while they have a current program, and for bad input', async () => {
    const { admin, member, memberId, exerciseId } = await household()
    await doWeekOne(member, exerciseId)
    const past = await archiveAndFindPast(admin, memberId)
    await restart(admin, memberId, past.enrollmentId, { startDate: today(), mode: 'again' })

    const { progress: p } = await progress(admin, memberId)
    const current = p.plan.enrollment.id
    expect(
      (await restart(admin, memberId, current, { startDate: today(), mode: 'fresh' })).status,
    ).toBe(409)
    expect(
      (await restart(admin, memberId, past.enrollmentId, { startDate: today(), mode: 'nope' }))
        .status,
    ).toBe(400)
  })

  it('has nothing to pick up when every workout is done', async () => {
    const { admin, memberId } = await household()
    const past = await archiveAndFindPast(admin, memberId)
    // Nothing done yet: picks up at week 1.
    expect(past.resumeWeek).toBe(1)
    expect(
      (await restart(admin, memberId, past.enrollmentId, { startDate: today(), mode: 'continue' }))
        .data.startDate,
    ).toBe(today())
  })

  it('is only for their own coach', async () => {
    const { admin, member, memberId } = await household()
    const past = await archiveAndFindPast(admin, memberId)
    const res = await restart(member, memberId, past.enrollmentId, {
      startDate: today(),
      mode: 'fresh',
    })
    expect([403, 404]).toContain(res.status)
  })
})
