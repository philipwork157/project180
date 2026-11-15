// Stopping a workout: cancel (client or coach), stopped early vs cancelled, and closing idle ones.
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ADMIN, call, MEMBER, setupHousehold } from './helpers'

type Json = Record<string, any>
const HOUR_MS = 60 * 60 * 1000

/** A program on the member, so the member can start its workout. */
async function setup() {
  const { admin, member } = await setupHousehold()
  const ex = await call<Json>('/exercises', {
    method: 'POST',
    cookie: admin,
    body: { name: 'Squat', muscleGroup: 'legs' },
  })
  const exerciseId = ex.data.exercise.id as number
  const w = await call<Json>('/workouts', {
    method: 'POST',
    cookie: admin,
    body: { name: 'Legs', exercises: [{ exerciseId, targetSets: 3, restSeconds: 90 }] },
  })
  const p = await call<Json>('/programs', {
    method: 'POST',
    cookie: admin,
    body: {
      name: 'Base',
      durationWeeks: 1,
      days: [{ weekNumber: 1, dayNumber: 1, workoutId: w.data.workout.id }],
    },
  })
  const people = (await call<Json>('/admin/users', { cookie: admin })).data.users as Json[]
  const memberId = people.find((u) => u.email === MEMBER.email)?.id as number
  await call('/enrollments', {
    method: 'POST',
    cookie: admin,
    body: { userId: memberId, programId: p.data.program.id, startDate: '2026-11-09' },
  })
  const plan = await call<Json>('/me/plan', { cookie: member })
  const workoutId = plan.data.plan.days[0].workoutId as number
  const start = async () =>
    (
      await call<Json>('/sessions', {
        method: 'POST',
        cookie: member,
        body: { clientUuid: crypto.randomUUID(), workoutId },
      })
    ).data.session.id as number
  const logSet = (sessionId: number) =>
    call(`/sessions/${sessionId}/sets`, {
      method: 'PUT',
      cookie: member,
      body: { clientUuid: crypto.randomUUID(), exerciseId, setNumber: 1, weightKg: 40, reps: 8 },
    })
  return { admin, member, memberId, start, logSet }
}

const statusOf = async (id: number) =>
  (
    await env.DB.prepare('SELECT status FROM workout_sessions WHERE id = ?')
      .bind(id)
      .first<{ status: string }>()
  )?.status

describe('cancelling a workout', () => {
  it('the client cancels their own; it leaves their plan, the coach still sees it', async () => {
    const { admin, member, memberId, start, logSet } = await setup()
    const id = await start()
    await logSet(id)
    expect((await call(`/sessions/${id}/cancel`, { method: 'POST', cookie: member })).status).toBe(
      204,
    )
    expect(await statusOf(id)).toBe('cancelled')
    // Gone for the client: no "Resume", not in their history.
    expect((await call<Json>('/me/plan', { cookie: member })).data.activeSession).toBeNull()
    expect((await call<Json>('/sessions', { cookie: member })).data.sessions).toEqual([])
    // Still there for the coach, labelled.
    const progress = await call<Json>(`/admin/users/${memberId}/progress`, { cookie: admin })
    expect(progress.data.progress.recent[0]).toMatchObject({ id, status: 'cancelled' })
    expect(progress.data.progress.done).toBe(0)
    // Only once, and only your own.
    expect((await call(`/sessions/${id}/cancel`, { method: 'POST', cookie: member })).status).toBe(
      409,
    )
    const other = await start()
    expect(
      (await call(`/sessions/${other}/cancel`, { method: 'POST', cookie: admin })).status,
    ).toBe(404)
  })

  it('the coach can cancel a client’s open workout', async () => {
    const { admin, member, memberId, start } = await setup()
    const id = await start()
    const res = await call(`/admin/users/${memberId}/workouts/${id}/cancel`, {
      method: 'POST',
      cookie: admin,
    })
    expect(res.status).toBe(204)
    expect(await statusOf(id)).toBe('cancelled')
    expect((await call<Json>('/me/plan', { cookie: member })).data.activeSession).toBeNull()
    // Not through another person's id, and not by a client.
    const adminId = (
      await env.DB.prepare('SELECT id FROM users WHERE email = ?')
        .bind(ADMIN.email)
        .first<{ id: number }>()
    )?.id
    const again = await start()
    expect(
      (
        await call(`/admin/users/${adminId}/workouts/${again}/cancel`, {
          method: 'POST',
          cookie: admin,
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await call(`/admin/users/${memberId}/workouts/${again}/cancel`, {
          method: 'POST',
          cookie: member,
        })
      ).status,
    ).toBe(403)
  })
})

describe('closing idle workouts', () => {
  it('after 4 hours: stopped early with sets logged, cancelled without', async () => {
    const { member, start, logSet } = await setup()
    const withSets = await start()
    await logSet(withSets)
    const old = Date.now() - 5 * HOUR_MS
    await env.DB.prepare('UPDATE workout_sessions SET started_at = ? WHERE id = ?')
      .bind(old, withSets)
      .run()
    await env.DB.prepare('UPDATE set_logs SET completed_at = ? WHERE session_id = ?')
      .bind(old, withSets)
      .run()
    // Opening the app closes it, so there's no stale "Resume".
    expect((await call<Json>('/me/plan', { cookie: member })).data.activeSession).toBeNull()
    expect(await statusOf(withSets)).toBe('abandoned')

    const empty = await start()
    await env.DB.prepare('UPDATE workout_sessions SET started_at = ? WHERE id = ?')
      .bind(old, empty)
      .run()
    expect((await call<Json>('/sessions/active', { cookie: member })).data.session).toBeNull()
    expect(await statusOf(empty)).toBe('cancelled')
  })

  it('a workout with a set logged recently stays open, however long ago it started', async () => {
    const { member, start, logSet } = await setup()
    const id = await start()
    await env.DB.prepare('UPDATE workout_sessions SET started_at = ? WHERE id = ?')
      .bind(Date.now() - 5 * HOUR_MS, id)
      .run()
    await logSet(id)
    expect((await call<Json>('/me/plan', { cookie: member })).data.activeSession?.id).toBe(id)
    expect(await statusOf(id)).toBe('in_progress')
  })

  it('starting another closes the open one the same way', async () => {
    const { start, logSet } = await setup()
    const first = await start()
    await logSet(first)
    const second = await start()
    expect(await statusOf(first)).toBe('abandoned')
    await start()
    expect(await statusOf(second)).toBe('cancelled')
  })
})
