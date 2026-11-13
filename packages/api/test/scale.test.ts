// D1 allows at most 100 bound values in one SQL statement. Lists that pass every id at once
// break as soon as the library passes 100 items, so these tests go past it on purpose.
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, signIn } from './helpers'

type Json = Record<string, any>

const WORKOUTS = 120
const PROGRAMS = 105

/** Many library workouts and programs, written straight to the database (fast). */
async function bigLibrary(cookie: string) {
  const ex = await call<Json>('/exercises', {
    method: 'POST',
    cookie,
    body: { name: 'Squat', muscleGroup: 'legs' },
  })
  const exerciseId = ex.data.exercise.id as number
  const owner = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(ADMIN.email)
    .first<{ id: number }>()
  const now = Date.now()
  const insertWorkout = env.DB.prepare(
    'INSERT INTO workouts (name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id',
  )
  const workoutIds: number[] = []
  for (let i = 1; i <= WORKOUTS; i++) {
    const row = await insertWorkout
      .bind(`Workout ${String(i).padStart(3, '0')}`, owner?.id, now, now)
      .first<{ id: number }>()
    workoutIds.push(row?.id as number)
  }
  await env.DB.batch(
    workoutIds.flatMap((id, i) => [
      env.DB.prepare(
        'INSERT INTO workout_exercises (workout_id, exercise_id, position) VALUES (?, ?, 0)',
      ).bind(id, exerciseId),
      // Every other workout has a superset group, so the group loader is exercised too.
      ...(i % 2 === 0
        ? [
            env.DB.prepare(
              'INSERT INTO workout_groups (workout_id, group_number, kind, rounds) VALUES (?, 1, ?, 3)',
            ).bind(id, 'superset'),
          ]
        : []),
    ]),
  )
  const insertProgram = env.DB.prepare(
    'INSERT INTO programs (name, duration_weeks, created_by, created_at, updated_at) VALUES (?, 2, ?, ?, ?) RETURNING id',
  )
  for (let i = 1; i <= PROGRAMS; i++) {
    const program = await insertProgram
      .bind(`Program ${String(i).padStart(3, '0')}`, owner?.id, now, now)
      .first<{ id: number }>()
    await env.DB.batch([
      env.DB.prepare(
        'INSERT INTO program_days (program_id, week_number, day_number, workout_id) VALUES (?, 1, 1, ?)',
      ).bind(program?.id, workoutIds[i % WORKOUTS]),
      env.DB.prepare(
        'INSERT INTO program_days (program_id, week_number, day_number, workout_id) VALUES (?, 2, 3, ?)',
      ).bind(program?.id, workoutIds[(i + 1) % WORKOUTS]),
      // A rest day and a day past the program's length: neither counts as a workout day.
      env.DB.prepare(
        'INSERT INTO program_days (program_id, week_number, day_number, workout_id) VALUES (?, 2, 5, NULL)',
      ).bind(program?.id),
      env.DB.prepare(
        'INSERT INTO program_days (program_id, week_number, day_number, workout_id) VALUES (?, 3, 1, ?)',
      ).bind(program?.id, workoutIds[0]),
    ])
  }
}

describe('a library past 100 items', () => {
  it('lists every workout with its exercises', async () => {
    await createAdmin()
    const cookie = await signIn(ADMIN.email, ADMIN.password)
    await bigLibrary(cookie)
    const res = await call<Json>('/workouts', { cookie })
    expect(res.status).toBe(200)
    const list = res.data.workouts as Json[]
    expect(list).toHaveLength(WORKOUTS)
    expect(list.every((w) => w.exerciseCount === 1)).toBe(true)
  })

  it('lists every program with its workout days counted', async () => {
    await createAdmin()
    const cookie = await signIn(ADMIN.email, ADMIN.password)
    await bigLibrary(cookie)
    const res = await call<Json>('/programs', { cookie })
    expect(res.status).toBe(200)
    const list = res.data.programs as Json[]
    expect(list).toHaveLength(PROGRAMS)
    // Two workout days in its 2 weeks; the rest day and the week-3 day don't count.
    expect(list.every((p) => p.workoutDays === 2)).toBe(true)
  })
})
