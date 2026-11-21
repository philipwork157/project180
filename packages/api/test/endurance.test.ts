import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, signIn } from './helpers'

type Json = Record<string, any>

async function owner() {
  await createAdmin()
  return signIn(ADMIN.email, ADMIN.password)
}

describe('endurance workouts', () => {
  it('keeps power, cadence, effort and climb targets, and logs heart rate, watts and climb', async () => {
    const cookie = await owner()
    const ride = await call<Json>('/exercises', {
      method: 'POST',
      cookie,
      body: {
        name: 'Hill Ride',
        muscleGroup: 'cardio',
        category: 'cardio',
        trackingType: 'distance_time',
      },
    })
    const squat = await call<Json>('/exercises', {
      method: 'POST',
      cookie,
      body: { name: 'Back Squat', muscleGroup: 'legs' },
    })
    const w = await call<Json>('/workouts', {
      method: 'POST',
      cookie,
      body: {
        name: 'Sweet spot and squats',
        exercises: [
          {
            exerciseId: ride.data.exercise.id,
            targetSets: 3,
            targetDistanceM: 8000,
            targetHrZone: 3,
            targetPowerPct: 90,
            targetCadence: 85,
            targetRpe: 7,
            targetElevationM: 250,
          },
          // Effort works on strength too (RPE 8 for a powerlifter).
          { exerciseId: squat.data.exercise.id, targetSets: 5, targetRepsMin: 3, targetRpe: 8 },
        ],
      },
    })
    expect(w.status).toBe(201)
    expect(w.data.workout.exercises[0]).toMatchObject({
      targetPowerPct: 90,
      targetCadence: 85,
      targetRpe: 7,
      targetElevationM: 250,
    })
    expect(w.data.workout.exercises[1]).toMatchObject({ targetRpe: 8, targetPowerPct: null })

    // Starting it snapshots the targets.
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie,
      body: { clientUuid: crypto.randomUUID(), workoutId: w.data.workout.id },
    })
    expect(s.data.session.exercises[0]).toMatchObject({ targetPowerPct: 90, targetRpe: 7 })
    const id = s.data.session.id

    const set = await call<Json>(`/sessions/${id}/sets`, {
      method: 'PUT',
      cookie,
      body: {
        clientUuid: crypto.randomUUID(),
        exerciseId: ride.data.exercise.id,
        setNumber: 1,
        distanceM: 8000,
        durationSeconds: 960,
        avgHr: 151,
        avgWatts: 228,
        elevationM: 240,
      },
    })
    expect(set.status).toBe(200)
    const detail = await call<Json>(`/sessions/${id}`, { cookie })
    expect(detail.data.session.sets[0]).toMatchObject({
      avgHr: 151,
      avgWatts: 228,
      elevationM: 240,
    })

    // A heart rate no one has is refused.
    const bad = await call<Json>(`/sessions/${id}/sets`, {
      method: 'PUT',
      cookie,
      body: {
        clientUuid: crypto.randomUUID(),
        exerciseId: ride.data.exercise.id,
        setNumber: 2,
        avgHr: 400,
      },
    })
    expect(bad.status).toBe(400)
  })

  it('refuses targets out of range', async () => {
    const cookie = await owner()
    const ex = await call<Json>('/exercises', {
      method: 'POST',
      cookie,
      body: { name: 'Easy Run', muscleGroup: 'cardio', trackingType: 'distance_time' },
    })
    const w = await call<Json>('/workouts', {
      method: 'POST',
      cookie,
      body: {
        name: 'Too much',
        exercises: [{ exerciseId: ex.data.exercise.id, targetSets: 1, targetPowerPct: 500 }],
      },
    })
    expect(w.status).toBe(400)
  })
})
