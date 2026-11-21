import { env } from 'cloudflare:test'
import { createDb } from '@project180/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builderSettings } from '../src/settings'
import { buildWorkout, libraryFor, toWorkoutInput } from '../src/workout-builder'
import { ADMIN, call, createAdmin, setupHousehold, signIn, signInPlatform } from './helpers'

type Json = Record<string, any>

afterEach(() => {
  vi.restoreAllMocks()
})

const keyed = { ...env, ANTHROPIC_API_KEY: 'test-key' }

async function library(cookie: string) {
  const add = async (body: Json) =>
    (await call<Json>('/exercises', { method: 'POST', cookie, body })).data.exercise.id as number
  return {
    press: await add({ name: 'Dumbbell Bench Press', muscleGroup: 'chest', equipment: 'dumbbell' }),
    row: await add({ name: 'Dumbbell Row', muscleGroup: 'back', equipment: 'dumbbell' }),
    pushUp: await add({
      name: 'Push-up',
      muscleGroup: 'chest',
      equipment: 'bodyweight',
      trackingType: 'reps',
    }),
    plank: await add({
      name: 'Plank',
      muscleGroup: 'core',
      equipment: 'bodyweight',
      trackingType: 'time',
    }),
  }
}

const reply = (ids: Json, over: Json = {}) => ({
  name: 'Upper Body Dumbbells A',
  description: 'A short upper-body session.',
  estimated_minutes: 40,
  exercises: [
    {
      exercise_id: ids.plank,
      section: 'cool_down',
      sets: 2,
      reps_min: null,
      reps_max: null,
      seconds: 45,
      rest_seconds: 30,
      group: null,
      notes: null,
    },
    {
      exercise_id: ids.press,
      section: 'main',
      sets: 4,
      reps_min: 12,
      reps_max: 8,
      seconds: null,
      rest_seconds: 90,
      group: 1,
      notes: 'Slow down',
    },
    {
      exercise_id: ids.row,
      section: 'main',
      sets: 4,
      reps_min: 10,
      reps_max: 10,
      seconds: null,
      rest_seconds: 90,
      group: 1,
      notes: null,
    },
    {
      exercise_id: ids.pushUp,
      section: 'warm_up',
      sets: 1,
      reps_min: 10,
      reps_max: null,
      seconds: null,
      rest_seconds: 0,
      group: null,
      notes: null,
    },
    {
      exercise_id: 999999,
      section: 'main',
      sets: 3,
      reps_min: 10,
      reps_max: 12,
      seconds: null,
      rest_seconds: 60,
      group: null,
      notes: null,
    },
  ],
  groups: [{ group: 1, kind: 'superset', rounds: 4, work_seconds: null, rest_seconds: 60 }],
  missing: ['Cable Fly'],
  note: null,
  ...over,
})

const claudeAnswers = (body: Json) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(body) }],
    }),
  )

describe('Build with Claude', () => {
  it('turns the answer into a normal workout input, dropping exercises not in the library', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    const ids = await library(owner)
    const me = (await call<Json>('/me', { cookie: owner })).data.user
    const lib = await libraryFor(createDb(env.DB), me)
    const input = toWorkoutInput(reply(ids) as any, lib, 'Upper body, dumbbells, 40 min')
    expect(input?.exercises.map((e) => e.exerciseId)).toEqual([
      ids.pushUp,
      ids.press,
      ids.row,
      ids.plank,
    ])
    expect(input?.exercises[1]).toMatchObject({
      targetRepsMin: 8,
      targetRepsMax: 12,
      supersetGroup: 1,
    })
    expect(input?.exercises[0]).toMatchObject({
      bodyweight: true,
      targetRepsMin: 10,
      targetRepsMax: 10,
    })
    expect(input?.exercises[3]).toMatchObject({ targetSeconds: 45, targetRepsMin: null })
    expect(input?.groups).toEqual([
      expect.objectContaining({ groupNumber: 1, kind: 'superset', rounds: 4 }),
    ])
    expect(input?.description).toContain('Built with Claude from: “Upper body, dumbbells, 40 min”')
    expect(
      toWorkoutInput(reply(ids, { exercises: [reply(ids).exercises[4]] }) as any, lib, 'x'),
    ).toBeNull()
  })

  it('creates exactly one new workout and leaves every existing workout as it was', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    const ids = await library(owner)
    const existing = await call<Json>('/workouts', {
      method: 'POST',
      cookie: owner,
      body: { name: 'Leg Day A', exercises: [{ exerciseId: ids.press, targetSets: 3 }] },
    })
    const snapshot = async () => ({
      workouts: (await env.DB.prepare('SELECT * FROM workouts ORDER BY id').all()).results,
      rows: (await env.DB.prepare('SELECT * FROM workout_exercises ORDER BY id').all()).results,
      exercises: (await env.DB.prepare('SELECT * FROM exercises ORDER BY id').all()).results,
    })
    const before = await snapshot()

    const spy = claudeAnswers(reply(ids))
    const me = (await call<Json>('/me', { cookie: owner })).data.user
    const result = await buildWorkout(
      createDb(env.DB),
      keyed,
      me,
      'Upper body, dumbbells, 40 min',
      {
        model: 'claude-sonnet-5-5',
      },
    )

    expect(result.workout.name).toBe('Upper Body Dumbbells A')
    expect(result.workout.exercises).toHaveLength(4)
    expect(result.missing).toEqual(['Cable Fly'])
    const after = await snapshot()
    // Everything that was there is unchanged; the only new rows belong to the new workout.
    expect(after.workouts.slice(0, before.workouts.length)).toEqual(before.workouts)
    expect(after.workouts).toHaveLength(before.workouts.length + 1)
    expect(after.rows.slice(0, before.rows.length)).toEqual(before.rows)
    expect(
      after.rows.slice(before.rows.length).every((r: Json) => r.workout_id === result.workout.id),
    ).toBe(true)
    expect(after.exercises).toEqual(before.exercises)
    expect(result.workout.id).not.toBe(existing.data.workout.id)

    // The library went to Claude, with the fixed answer shape.
    const body = JSON.parse(String(spy.mock.calls[0]?.[1]?.body))
    expect(body.model).toBe('claude-sonnet-5-5')
    expect(body.output_config.format.type).toBe('json_schema')
    expect(body.messages[0].content[0].text).toContain(
      `${ids.row} | Dumbbell Row | back | dumbbell | reps`,
    )
    // The library is cached with the instructions; the coach's request is not.
    expect(body.messages[0].content[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(body.messages[0].content[1].cache_control).toBeUndefined()
  })

  it('creates nothing when Claude only picks exercises that aren’t in the library', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    const ids = await library(owner)
    claudeAnswers(reply(ids, { exercises: [reply(ids).exercises[4]] }))
    const me = (await call<Json>('/me', { cookie: owner })).data.user
    await expect(
      buildWorkout(createDb(env.DB), keyed, me, 'Something odd', { model: 'claude-sonnet-5-5' }),
    ).rejects.toMatchObject({
      status: 422,
    })
    const count = await env.DB.prepare('SELECT count(*) AS n FROM workouts').first<Json>()
    expect(count?.n).toBe(0)
  })

  it('is staff only, needs the key, and the owner can switch it off', async () => {
    const { admin, member } = await setupHousehold()
    expect(
      (
        await call('/workout-builder', {
          method: 'POST',
          cookie: member,
          body: { prompt: 'Full body for beginners' },
        })
      ).status,
    ).toBe(403)
    // No key on the test site: the button stays hidden and building answers 503.
    expect((await call<Json>('/workout-builder', { cookie: admin })).data).toEqual({
      available: false,
    })
    expect(
      (
        await call('/workout-builder', {
          method: 'POST',
          cookie: admin,
          body: { prompt: 'Full body for beginners' },
        })
      ).status,
    ).toBe(503)

    const db = createDb(env.DB)
    expect((await builderSettings(db, keyed)).enabled).toBe(true)
    // Only the platform admin switches it; owners and clients get 404 there.
    const platform = await signInPlatform()
    for (const cookie of [admin, member]) {
      const tries = await call('/platform/claude', {
        method: 'PUT',
        cookie,
        body: { feature: 'workout_builder', enabled: false },
      })
      expect(tries.status).toBe(404)
    }
    await call('/platform/claude', {
      method: 'PUT',
      cookie: platform,
      asAdminApp: true,
      body: { feature: 'workout_builder', enabled: false },
    })
    expect(await builderSettings(db, keyed)).toMatchObject({
      enabled: false,
      configured: true,
    })
    // Programs have their own switch, still on.
    expect((await builderSettings(db, keyed, 'program_builder')).enabled).toBe(true)
  })
})
