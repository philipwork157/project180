import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, signIn } from './helpers'

type Json = Record<string, any>

async function owner() {
  await createAdmin()
  return signIn(ADMIN.email, ADMIN.password)
}

describe('rep schemes and bodyweight', () => {
  it('saves reps set by set (12, 10, 10, 8), sets the set count, and passes it to the session', async () => {
    const cookie = await owner()
    const ex = await call<Json>('/exercises', {
      method: 'POST',
      cookie,
      body: { name: 'Leg Press', muscleGroup: 'legs' },
    })
    const w = await call<Json>('/workouts', {
      method: 'POST',
      cookie,
      body: {
        name: 'Pyramid',
        exercises: [
          { exerciseId: ex.data.exercise.id, targetSets: 3, targetRepsPerSet: [12, 10, 10, 8] },
        ],
      },
    })
    expect(w.status).toBe(201)
    expect(w.data.workout.exercises[0]).toMatchObject({
      targetSets: 4,
      targetRepsPerSet: [12, 10, 10, 8],
      targetRepsMin: 8,
      targetRepsMax: 12,
      bodyweight: false,
    })
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie,
      body: { clientUuid: crypto.randomUUID(), workoutId: w.data.workout.id },
    })
    expect(s.data.session.exercises[0]).toMatchObject({
      targetSets: 4,
      targetRepsPerSet: [12, 10, 10, 8],
    })
  })

  it('marks an exercise as bodyweight for this workout', async () => {
    const cookie = await owner()
    const ex = await call<Json>('/exercises', {
      method: 'POST',
      cookie,
      body: { name: 'Walking Lunge', muscleGroup: 'legs' },
    })
    const w = await call<Json>('/workouts', {
      method: 'POST',
      cookie,
      body: {
        name: 'Bodyweight legs',
        exercises: [{ exerciseId: ex.data.exercise.id, targetSets: 3, bodyweight: true }],
      },
    })
    expect(w.data.workout.exercises[0]).toMatchObject({ bodyweight: true, targetRepsPerSet: null })
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie,
      body: { clientUuid: crypto.randomUUID(), workoutId: w.data.workout.id },
    })
    expect(s.data.session.exercises[0].bodyweight).toBe(true)
  })

  it('keeps search words on exercises', async () => {
    const cookie = await owner()
    const ex = await call<Json>('/exercises', {
      method: 'POST',
      cookie,
      body: {
        name: 'Seated Leg Curl',
        muscleGroup: 'legs',
        keywords: 'hamstrings, seated hamstring curl',
      },
    })
    expect(ex.data.exercise.keywords).toBe('hamstrings, seated hamstring curl')
  })
})

describe('how-to videos', () => {
  it('without a YouTube key, sends people to a YouTube search', async () => {
    const cookie = await owner()
    const ex = await call<Json>('/exercises', {
      method: 'POST',
      cookie,
      body: { name: 'Heel Slide', muscleGroup: 'pelvic_floor' },
    })
    const res = await call<Json>(`/videos?exerciseId=${ex.data.exercise.id}`, { cookie })
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ results: [], configured: false })
    expect(res.data.searchUrl).toContain('youtube.com/results')
    expect((await call('/videos?exerciseId=99999', { cookie })).status).toBe(404)
  })
})
