// The daily cleanup, one workout in progress per person, and the active-only enrollments list.

import { env } from 'cloudflare:test'
import { createDb } from '@project180/db'
import { describe, expect, it } from 'vitest'
import { dailyCleanup } from '../src/cleanup'
import { ADMIN, call, MEMBER, setupHousehold } from './helpers'

type Json = Record<string, any>
const DAY_MS = 24 * 60 * 60 * 1000

async function aWorkout(cookie: string) {
  const ex = await call<Json>('/exercises', {
    method: 'POST',
    cookie,
    body: { name: 'Squat', muscleGroup: 'legs' },
  })
  const w = await call<Json>('/workouts', {
    method: 'POST',
    cookie,
    body: {
      name: 'Legs',
      exercises: [{ exerciseId: ex.data.exercise.id, targetSets: 3, restSeconds: 90 }],
    },
  })
  return w.data.workout.id as number
}

const start = (cookie: string, workoutId: number) =>
  call<Json>('/sessions', {
    method: 'POST',
    cookie,
    body: { clientUuid: crypto.randomUUID(), workoutId },
  })

const statusOf = async (id: number) =>
  (
    await env.DB.prepare('SELECT status FROM workout_sessions WHERE id = ?')
      .bind(id)
      .first<{ status: string }>()
  )?.status

describe('one workout in progress', () => {
  it('starting another closes the first, and the database refuses a second', async () => {
    const { admin } = await setupHousehold()
    const workoutId = await aWorkout(admin)
    const first = (await start(admin, workoutId)).data.session.id as number
    const second = (await start(admin, workoutId)).data.session.id as number
    // Nothing was logged in the first one, so it's cancelled rather than stopped early.
    expect(await statusOf(first)).toBe('cancelled')
    expect(await statusOf(second)).toBe('in_progress')
    const userId = (
      await env.DB.prepare('SELECT id FROM users WHERE email = ?')
        .bind(ADMIN.email)
        .first<{ id: number }>()
    )?.id
    await expect(
      env.DB.prepare(
        "INSERT INTO workout_sessions (client_uuid, user_id, workout_id, started_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'in_progress', ?, ?)",
      )
        .bind(crypto.randomUUID(), userId, workoutId, Date.now(), Date.now(), Date.now())
        .run(),
    ).rejects.toThrow(/UNIQUE/)
  })
})

describe('daily cleanup', () => {
  it('closes forgotten workouts and removes expired sign-ins and old counters', async () => {
    const { admin } = await setupHousehold()
    const workoutId = await aWorkout(admin)
    const forgotten = (await start(admin, workoutId)).data.session.id as number
    await env.DB.prepare('UPDATE workout_sessions SET started_at = ? WHERE id = ?')
      .bind(Date.now() - 2 * DAY_MS, forgotten)
      .run()
    // An expired sign-in (the member's, the newest), and a wrong-password counter from two days ago.
    await env.DB.prepare(
      'UPDATE sessions SET expires_at = ? WHERE id = (SELECT max(id) FROM sessions)',
    )
      .bind(Date.now() - DAY_MS)
      .run()
    await env.DB.prepare(
      'INSERT INTO sign_in_attempts (key, failures, first_at, locked_until) VALUES (?, 3, ?, NULL)',
    )
      .bind('email:old@example.com', Date.now() - 2 * DAY_MS)
      .run()
    // Photo counters: last week's goes, today's stays.
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    await env.DB.prepare(
      'INSERT INTO food_photo_uses (user_id, date, count) SELECT id, ?, 3 FROM users LIMIT 1',
    )
      .bind(day(Date.now() - 7 * DAY_MS))
      .run()
    await env.DB.prepare(
      'INSERT INTO food_photo_uses (user_id, date, count) SELECT id, ?, 1 FROM users LIMIT 1',
    )
      .bind(day(Date.now()))
      .run()
    const before = await env.DB.prepare('SELECT count(*) AS n FROM sessions').first<Json>()

    const done = await dailyCleanup(createDb(env.DB))
    expect(done).toMatchObject({ sessions: 1, attempts: 1, workouts: 1, photoDays: 1 })
    const photoRows = await env.DB.prepare('SELECT date FROM food_photo_uses').all<Json>()
    expect(photoRows.results.map((r) => r.date)).toEqual([day(Date.now())])
    // Nothing logged in it: cancelled.
    expect(await statusOf(forgotten)).toBe('cancelled')
    const after = await env.DB.prepare('SELECT count(*) AS n FROM sessions').first<Json>()
    expect(after?.n).toBe((before?.n as number) - 1)

    // A workout started today is left alone.
    const today = (await start(admin, workoutId)).data.session.id as number
    await dailyCleanup(createDb(env.DB))
    expect(await statusOf(today)).toBe('in_progress')
  })
})

describe('enrollments list', () => {
  it('?status=active leaves out past programs', async () => {
    const { admin } = await setupHousehold()
    const workoutId = await aWorkout(admin)
    const program = await call<Json>('/programs', {
      method: 'POST',
      cookie: admin,
      body: {
        name: 'Base',
        durationWeeks: 1,
        days: [{ weekNumber: 1, dayNumber: 1, workoutId }],
      },
    })
    const people = (await call<Json>('/admin/users', { cookie: admin })).data.users as Json[]
    const userId = people.find((u) => u.email === MEMBER.email)?.id
    for (const startDate of ['2026-11-02', '2026-11-09']) {
      await call('/enrollments', {
        method: 'POST',
        cookie: admin,
        body: { userId, programId: program.data.program.id, startDate },
      })
    }
    const all = (await call<Json>('/enrollments', { cookie: admin })).data.enrollments
    const active = (await call<Json>('/enrollments?status=active', { cookie: admin })).data
      .enrollments
    expect(all).toHaveLength(2)
    expect(active).toHaveLength(1)
    expect(active[0]).toMatchObject({ status: 'active', startDate: '2026-11-09' })
  })
})
