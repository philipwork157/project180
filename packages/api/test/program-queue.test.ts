// Programs one after another: a coach queues the next program, it takes over on its start date,
// and everything logged on the old one stays in the client's history.

import { env } from 'cloudflare:test'
import { createDb } from '@project180/db'
import { addDays, todayIn } from '@project180/shared'
import { describe, expect, it } from 'vitest'
import { startDuePrograms } from '../src/schedule'
import { call, MEMBER, setupHousehold, signIn } from './helpers'

type Json = Record<string, any>

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }
const today = () => todayIn('Africa/Johannesburg')

async function weekProgram(cookie: string, name: string) {
  const ex = await call<Json>('/exercises', {
    method: 'POST',
    cookie,
    body: { name: `${name} squat`, muscleGroup: 'legs' },
  })
  const w = await call<Json>('/workouts', {
    method: 'POST',
    cookie,
    body: { name: `${name} legs`, exercises: [{ exerciseId: ex.data.exercise.id, targetSets: 3 }] },
  })
  const p = await call<Json>('/programs', {
    method: 'POST',
    cookie,
    body: {
      name,
      durationWeeks: 1,
      days: [{ weekNumber: 1, dayNumber: 1, workoutId: w.data.workout.id }],
    },
  })
  return p.data.program.id as number
}

async function household() {
  const { admin, member } = await setupHousehold()
  const people = (await call<Json>('/admin/users', { cookie: admin })).data.users as Json[]
  const memberId = people.find((u) => u.email === MEMBER.email)?.id as number
  const week1 = await weekProgram(admin, 'Week 1')
  const week2 = await weekProgram(admin, 'Week 2')
  return { admin, member, memberId, week1, week2 }
}

const assign = (cookie: string, userId: number, programId: number, startDate: string) =>
  call<Json>('/enrollments', { method: 'POST', cookie, body: { userId, programId, startDate } })

/** Logs one finished workout on their current plan's first workout day. */
async function logWorkout(member: string) {
  const plan = (await call<Json>('/me/plan', { cookie: member })).data.plan
  const day = plan.days.find((d: Json) => d.workoutId !== null)
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
  const id = started.data.session.id
  await call(`/sessions/${id}/finish`, { method: 'POST', cookie: member, body: { feeling: 4 } })
  return id as number
}

describe('queueing the next program', () => {
  it('waits behind the current program and takes over on its start date', async () => {
    const { admin, member, memberId, week1, week2 } = await household()
    expect((await assign(admin, memberId, week1, today())).status).toBe(201)
    const sessionId = await logWorkout(member)

    const tomorrow = addDays(today(), 1)
    const queued = await assign(admin, memberId, week2, tomorrow)
    expect(queued.status).toBe(201)
    expect(queued.data.enrollment).toMatchObject({ status: 'scheduled', startDate: tomorrow })

    // Today nothing changes for them: still week 1, with week 2 lined up.
    const before = (await call<Json>('/me/plan', { cookie: member })).data.plan
    expect(before.enrollment.programName).toBe('Week 1')
    expect(before.next).toMatchObject({ programName: 'Week 2', startDate: tomorrow })
    const coachView = (await call<Json>(`/admin/users/${memberId}/progress`, { cookie: admin }))
      .data
    expect(coachView.progress.plan.enrollment.programName).toBe('Week 1')
    expect(coachView.upcoming).toMatchObject([{ programName: 'Week 2', startDate: tomorrow }])
    expect(coachView.past).toEqual([])

    // Tomorrow (the daily run): week 2 is current, week 1 is finished with its history.
    const morning = new Date(`${tomorrow}T03:00:00Z`)
    expect(await startDuePrograms(createDb(env.DB), 'everyone', morning)).toBe(1)
    expect(await startDuePrograms(createDb(env.DB), 'everyone', morning)).toBe(0)
    const after = (await call<Json>(`/admin/users/${memberId}/progress`, { cookie: admin })).data
    expect(after.progress.plan.enrollment.programName).toBe('Week 2')
    expect(after.progress.plan.assigned.startedAt).not.toBeNull()
    expect(after.upcoming).toEqual([])
    expect(after.past).toMatchObject([
      { programName: 'Week 1', status: 'completed', workouts: 1, recent: [{ id: sessionId }] },
    ])
    // The finished workout itself is untouched and still opens for the coach.
    const detail = await call(`/admin/users/${memberId}/workouts/${sessionId}`, { cookie: admin })
    expect(detail.status).toBe(200)
  })

  it('switches over as soon as anyone looks, without waiting for the daily run', async () => {
    const { admin, member, memberId, week1, week2 } = await household()
    await assign(admin, memberId, week1, addDays(today(), -3))
    const queued = await assign(admin, memberId, week2, addDays(today(), 2))
    // The day comes (moved here instead of waiting two days).
    await env.DB.prepare('UPDATE enrollments SET start_date = ? WHERE id = ?')
      .bind(today(), queued.data.enrollment.id)
      .run()
    const plan = (await call<Json>('/me/plan', { cookie: member })).data.plan
    expect(plan.enrollment.programName).toBe('Week 2')
    expect(plan.next).toBeNull()
    const rows = await env.DB.prepare(
      'SELECT status FROM enrollments WHERE user_id = ? ORDER BY id',
    )
      .bind(memberId)
      .all<Json>()
    expect(rows.results.map((r) => r.status)).toEqual(['completed', 'active'])
  })

  it('replaces the current program now when it starts today, and refuses two on one day', async () => {
    const { admin, member, memberId, week1, week2 } = await household()
    await assign(admin, memberId, week1, addDays(today(), -7))
    const now = await assign(admin, memberId, week2, today())
    expect(now.data.enrollment.status).toBe('active')
    expect(
      (await call<Json>('/me/plan', { cookie: member })).data.plan.enrollment.programName,
    ).toBe('Week 2')

    const later = addDays(today(), 7)
    expect((await assign(admin, memberId, week1, later)).status).toBe(201)
    const clash = await assign(admin, memberId, week1, later)
    expect(clash.status).toBe(409)
  })

  it('removing a queued program takes it off the list and leaves the current one alone', async () => {
    const { admin, member, memberId, week1, week2 } = await household()
    await assign(admin, memberId, week1, today())
    const queued = await assign(admin, memberId, week2, addDays(today(), 7))
    const id = queued.data.enrollment.id
    // It isn't a past program, so it can't be "re-enabled" around the queue.
    const restore = await call(`/admin/users/${memberId}/enrollments/${id}/restore`, {
      method: 'POST',
      cookie: admin,
    })
    expect(restore.status).toBe(409)
    const removed = await call(`/admin/users/${memberId}/enrollments/${id}`, {
      method: 'DELETE',
      cookie: admin,
    })
    expect(removed.status).toBe(204)
    const view = (await call<Json>(`/admin/users/${memberId}/progress`, { cookie: admin })).data
    expect(view.upcoming).toEqual([])
    expect(view.past).toEqual([])
    expect(view.progress.plan.enrollment.programName).toBe('Week 1')
    expect((await call<Json>('/me/plan', { cookie: member })).data.plan.next).toBeNull()
  })

  it('is private: another coach can’t see, queue or remove anything for someone else’s client', async () => {
    const { admin, member, memberId, week1, week2 } = await household()
    await assign(admin, memberId, week1, today())
    const queued = await assign(admin, memberId, week2, addDays(today(), 7))
    await call('/admin/users', { method: 'POST', cookie: admin, body: { ...COACH, role: 'admin' } })
    const coach = await signIn(COACH.email, COACH.password)

    const theirs = await weekProgram(coach, 'Kim plan')
    expect((await assign(coach, memberId, theirs, addDays(today(), 14))).status).toBe(404)
    expect((await call(`/admin/users/${memberId}/progress`, { cookie: coach })).status).toBe(404)
    const remove = await call(`/admin/users/${memberId}/enrollments/${queued.data.enrollment.id}`, {
      method: 'DELETE',
      cookie: coach,
    })
    expect(remove.status).toBe(404)
    const listed = (await call<Json>('/enrollments?status=scheduled', { cookie: coach })).data
      .enrollments
    expect(listed).toEqual([])
    // Clients never queue programs.
    expect((await assign(member, memberId, week2, addDays(today(), 21))).status).toBe(403)
    // Still there for their own coach.
    const own = (await call<Json>('/enrollments?status=scheduled', { cookie: admin })).data
      .enrollments
    expect(own).toHaveLength(1)
  })
})
