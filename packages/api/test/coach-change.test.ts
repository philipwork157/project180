// When a client moves to another coach, the old coach loses their program and workout copies,
// even though the old coach made them (created_by stays the coach who assigned them).
import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, signIn } from './helpers'

type Json = Record<string, any>

const KIM = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }

describe('a client who changes coach', () => {
  it('takes their program and workout copies away from the old coach', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    await call('/admin/users', { method: 'POST', cookie: owner, body: { ...KIM, role: 'admin' } })
    const kim = await signIn(KIM.email, KIM.password)
    const squat = (
      await call<Json>('/exercises', {
        method: 'POST',
        cookie: kim,
        body: { name: 'Squat', muscleGroup: 'legs' },
      })
    ).data.exercise.id as number
    const workout = (
      await call<Json>('/workouts', {
        method: 'POST',
        cookie: kim,
        body: {
          name: 'Kim legs',
          exercises: [{ exerciseId: squat, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10 }],
        },
      })
    ).data.workout.id as number
    const program = (
      await call<Json>('/programs', {
        method: 'POST',
        cookie: kim,
        body: {
          name: 'Kim base',
          durationWeeks: 1,
          days: [{ weekNumber: 1, dayNumber: 1, workoutId: workout }],
        },
      })
    ).data.program.id as number
    await call('/admin/users', {
      method: 'POST',
      cookie: kim,
      body: { name: 'Lee', email: 'lee@example.com', password: 'client-password-1' },
    })
    const people = (await call<Json>('/admin/users', { cookie: owner })).data.users as Json[]
    const lee = people.find((u) => u.email === 'lee@example.com')?.id as number
    await call('/enrollments', {
      method: 'POST',
      cookie: kim,
      body: { userId: lee, programId: program, startDate: '2026-11-09' },
    })
    const plan = (await call<Json>(`/admin/users/${lee}/progress`, { cookie: kim })).data.progress
      .plan
    const copyWorkout = (plan.days as Json[]).find((d) => d.workoutId)?.workoutId as number
    const enrollments = (await call<Json>('/enrollments?status=active', { cookie: kim })).data
      .enrollments as Json[]
    const copyProgram = enrollments.find((e) => e.userId === lee)?.programId as number
    expect(copyWorkout).not.toBe(workout)
    expect(copyProgram).not.toBe(program)
    // While Lee is hers, Kim sees both copies.
    expect((await call(`/programs/${copyProgram}`, { cookie: kim })).status).toBe(200)
    expect((await call(`/workouts/${copyWorkout}`, { cookie: kim })).status).toBe(200)

    // The owner takes Lee over.
    const ownerId = (await call<Json>('/me', { cookie: owner })).data.user.id as number
    await call(`/admin/users/${lee}/coach`, {
      method: 'PATCH',
      cookie: owner,
      body: { coachId: ownerId },
    })

    // Kim can no longer read, change, archive or reuse Lee's copies.
    expect((await call(`/programs/${copyProgram}`, { cookie: kim })).status).toBe(404)
    expect((await call(`/workouts/${copyWorkout}`, { cookie: kim })).status).toBe(404)
    const edit = await call(`/workouts/${copyWorkout}`, {
      method: 'PUT',
      cookie: kim,
      body: { name: 'Changed by Kim', exercises: [] },
    })
    expect([403, 404]).toContain(edit.status)
    const archive = await call(`/programs/${copyProgram}`, { method: 'DELETE', cookie: kim })
    expect([403, 404]).toContain(archive.status)
    // Her own library is untouched.
    expect((await call(`/programs/${program}`, { cookie: kim })).status).toBe(200)
    expect((await call(`/workouts/${workout}`, { cookie: kim })).status).toBe(200)
    // The new coach sees them.
    expect((await call(`/programs/${copyProgram}`, { cookie: owner })).status).toBe(200)
    expect((await call(`/workouts/${copyWorkout}`, { cookie: owner })).status).toBe(200)
  })
})
