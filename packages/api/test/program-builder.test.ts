import { env } from 'cloudflare:test'
import { createDb } from '@project180/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../src/program-builder'
import { ADMIN, call, createAdmin, setupHousehold, signIn } from './helpers'

type Json = Record<string, any>

afterEach(() => {
  vi.restoreAllMocks()
})

const keyed = { ...env, ANTHROPIC_API_KEY: 'test-key' }

async function library(cookie: string) {
  const add = async (body: Json) =>
    (await call<Json>('/exercises', { method: 'POST', cookie, body })).data.exercise.id as number
  const squat = await add({ name: 'Goblet Squat', muscleGroup: 'legs', equipment: 'dumbbell' })
  const press = await add({
    name: 'Dumbbell Bench Press',
    muscleGroup: 'chest',
    equipment: 'dumbbell',
  })
  const legDay = (
    await call<Json>('/workouts', {
      method: 'POST',
      cookie,
      body: { name: 'Leg Day A', exercises: [{ exerciseId: squat, targetSets: 3 }] },
    })
  ).data.workout.id as number
  return { squat, press, legDay }
}

const exercise = (id: number) => ({
  exercise_id: id,
  section: 'main',
  sets: 3,
  reps_min: 8,
  reps_max: 12,
  seconds: null,
  rest_seconds: 90,
  group: null,
  notes: null,
})

const reply = (ids: Json, over: Json = {}) => ({
  name: 'Beginner Full Body 2 Weeks',
  description: 'Two short weeks.',
  duration_weeks: 2,
  weigh_in_day: 1,
  new_workouts: [
    {
      key: 'A',
      name: 'Upper A',
      description: null,
      estimated_minutes: 40,
      exercises: [exercise(ids.press), exercise(999999)],
      groups: [],
    },
    // Never scheduled: not created.
    {
      key: 'B',
      name: 'Unused B',
      description: null,
      estimated_minutes: 30,
      exercises: [exercise(ids.squat)],
      groups: [],
    },
    // Nothing usable in it: not created, and its days are dropped.
    {
      key: 'C',
      name: 'Bad C',
      description: null,
      estimated_minutes: 30,
      exercises: [exercise(999999)],
      groups: [],
    },
  ],
  schedule: [
    { week: 1, day: 1, existing_workout_id: null, new_workout: 'A' },
    { week: 1, day: 3, existing_workout_id: ids.legDay, new_workout: null },
    { week: 2, day: 1, existing_workout_id: null, new_workout: 'a' },
    { week: 2, day: 3, existing_workout_id: ids.legDay, new_workout: null },
    { week: 2, day: 5, existing_workout_id: null, new_workout: 'C' },
    { week: 2, day: 6, existing_workout_id: 999999, new_workout: null },
    { week: 3, day: 1, existing_workout_id: null, new_workout: 'A' },
  ],
  missing: ['Cable Fly'],
  note: 'Add a set each week.',
  ...over,
})

const claudeAnswers = (body: Json) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(body) }],
    }),
  )

const snapshot = async () => ({
  programs: (await env.DB.prepare('SELECT * FROM programs ORDER BY id').all()).results,
  days: (await env.DB.prepare('SELECT * FROM program_days ORDER BY id').all()).results,
  workouts: (await env.DB.prepare('SELECT * FROM workouts ORDER BY id').all()).results,
  rows: (await env.DB.prepare('SELECT * FROM workout_exercises ORDER BY id').all()).results,
  exercises: (await env.DB.prepare('SELECT * FROM exercises ORDER BY id').all()).results,
})

describe('Build a program with Claude', () => {
  it('creates one new program (and only the new workouts it schedules), changing nothing else', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    const ids = await library(owner)
    await call('/programs', {
      method: 'POST',
      cookie: owner,
      body: {
        name: 'Old program',
        durationWeeks: 1,
        days: [{ weekNumber: 1, dayNumber: 2, workoutId: ids.legDay }],
      },
    })
    const before = await snapshot()

    const spy = claudeAnswers(reply(ids))
    const me = (await call<Json>('/me', { cookie: owner })).data.user
    const result = await buildProgram(createDb(env.DB), keyed, me, '2 weeks, beginner, full body', {
      model: 'claude-sonnet-5-5',
    })

    expect(result.program).toMatchObject({ name: 'Beginner Full Body 2 Weeks', durationWeeks: 2 })
    expect(result.newWorkouts).toEqual([expect.objectContaining({ name: 'Upper A', exercises: 1 })])
    expect(result.reusedWorkouts).toEqual([{ id: ids.legDay, name: 'Leg Day A' }])
    const upper = result.newWorkouts[0]?.id
    const schedule = result.program.days
      .filter((d) => d.workoutId !== null || d.checkinRequired)
      .map((d) => [d.weekNumber, d.dayNumber, d.workoutId, d.checkinRequired])
    expect(schedule).toEqual([
      [1, 1, upper, true],
      [1, 3, ids.legDay, false],
      [2, 1, upper, true],
      [2, 3, ids.legDay, false],
    ])

    const after = await snapshot()
    // Everything that was there is exactly as it was; only new rows were added.
    for (const table of ['programs', 'days', 'workouts', 'rows'] as const)
      expect(after[table].slice(0, before[table].length)).toEqual(before[table])
    expect(after.programs).toHaveLength(before.programs.length + 1)
    expect(after.workouts).toHaveLength(before.workouts.length + 1)
    expect(after.exercises).toEqual(before.exercises)

    // Claude saw the existing workouts and the exercise library.
    const body = JSON.parse(String(spy.mock.calls[0]?.[1]?.body))
    expect(body.messages[0].content[0].text).toContain(`${ids.legDay} | Leg Day A |`)
    expect(body.messages[0].content[1].text).toContain(`${ids.press} | Dumbbell Bench Press`)
    // Existing workouts show their exercises by section, so Claude sees how the coach builds.
    expect(body.messages[0].content[0].text).toMatch(/Leg Day A \| .* \| main: /)
    // Instructions, workouts and library are cached; the coach's request is not.
    expect(body.messages[0].content[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(body.messages[0].content[0].cache_control).toBeUndefined()
    expect(body.messages[0].content[2].cache_control).toBeUndefined()
    expect(body.messages[0].content[2].text).toContain('2 weeks, beginner, full body')
    // Full programs: mobility, main, abs, cardio and cool-down are part of the instructions.
    expect(body.system[0].text).toContain('fully fledged')
  })

  it('creates nothing when no training day is usable', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    const ids = await library(owner)
    const before = await snapshot()
    claudeAnswers(
      reply(ids, {
        schedule: [{ week: 1, day: 1, existing_workout_id: 999999, new_workout: 'C' }],
      }),
    )
    const me = (await call<Json>('/me', { cookie: owner })).data.user
    await expect(
      buildProgram(createDb(env.DB), keyed, me, 'Something odd', { model: 'claude-sonnet-5-5' }),
    ).rejects.toMatchObject({
      status: 422,
    })
    expect(await snapshot()).toEqual(before)
  })

  it('is staff only and needs the key', async () => {
    const { admin, member } = await setupHousehold()
    const body = { prompt: '4 weeks, 3 days a week, beginner' }
    expect((await call('/program-builder', { method: 'POST', cookie: member, body })).status).toBe(
      403,
    )
    expect((await call('/program-builder', { method: 'POST', cookie: admin, body })).status).toBe(
      503,
    )
  })
})
