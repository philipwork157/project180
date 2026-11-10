import { describe, expect, it } from 'vitest'
import { call, MEMBER, setupHousehold } from './helpers'

type Json = Record<string, any>

async function library(admin: string) {
  const squat = await call<Json>('/exercises', {
    method: 'POST',
    cookie: admin,
    body: { name: 'Squat', muscleGroup: 'legs', equipment: 'barbell' },
  })
  const thrust = await call<Json>('/exercises', {
    method: 'POST',
    cookie: admin,
    body: { name: 'Hip Thrust', muscleGroup: 'glutes', equipment: 'barbell' },
  })
  const workout = await call<Json>('/workouts', {
    method: 'POST',
    cookie: admin,
    body: {
      name: 'Leg Day A',
      exercises: [
        {
          exerciseId: squat.data.exercise.id,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 10,
          restSeconds: 90,
        },
        {
          exerciseId: thrust.data.exercise.id,
          targetSets: 3,
          targetRepsMin: 10,
          targetRepsMax: 12,
        },
      ],
    },
  })
  return {
    squat: squat.data.exercise.id,
    thrust: thrust.data.exercise.id,
    workout: workout.data.workout,
  }
}

/** The first workout day in someone's own plan (their personal copy's ids). */
async function firstPlanDay(
  cookie: string,
): Promise<{ workoutId: number; programDayId: number; programId: number }> {
  const plan = await call<Json>('/me/plan', { cookie })
  const day = plan.data.plan.days.find((d: Json) => d.workoutId !== null)
  return {
    workoutId: day.workoutId,
    programDayId: day.programDayId,
    programId: plan.data.plan.enrollment.programId,
  }
}

async function memberId(admin: string): Promise<number> {
  const list = await call<Json>('/admin/users', { cookie: admin })
  return list.data.users.find((u: Json) => u.email === MEMBER.email).id
}

describe('workouts', () => {
  it('keeps exercises in the order given', async () => {
    const { admin } = await setupHousehold()
    const { workout } = await library(admin)
    expect(workout.exercises.map((e: Json) => e.exerciseName)).toEqual(['Squat', 'Hip Thrust'])
    expect(workout.muscleGroups).toEqual(['legs', 'glutes'])
  })

  it('replaces the exercise list on save', async () => {
    const { admin } = await setupHousehold()
    const { workout, thrust } = await library(admin)
    const res = await call<Json>(`/workouts/${workout.id}`, {
      method: 'PUT',
      cookie: admin,
      body: { name: 'Glutes only', exercises: [{ exerciseId: thrust, targetSets: 4 }] },
    })
    expect(res.data.workout.exercises).toHaveLength(1)
    expect(res.data.workout.exercises[0].targetSets).toBe(4)
  })

  it('archives and restores', async () => {
    const { admin } = await setupHousehold()
    const { workout } = await library(admin)
    await call(`/workouts/${workout.id}`, { method: 'DELETE', cookie: admin })
    expect((await call<Json>('/workouts', { cookie: admin })).data.workouts).toHaveLength(0)
    expect(
      (await call<Json>('/workouts?archived=1', { cookie: admin })).data.workouts,
    ).toHaveLength(1)
    await call(`/workouts/${workout.id}/restore`, { method: 'POST', cookie: admin })
    expect((await call<Json>('/workouts', { cookie: admin })).data.workouts).toHaveLength(1)
  })
})

describe('programs and the plan', () => {
  it('builds a program, assigns it and lays out the calendar', async () => {
    const { admin, member } = await setupHousehold()
    const { workout } = await library(admin)
    const program = await call<Json>('/programs', {
      method: 'POST',
      cookie: admin,
      body: {
        name: '4-Week Strength',
        durationWeeks: 4,
        days: [
          { weekNumber: 1, dayNumber: 1, workoutId: workout.id, checkinRequired: true },
          { weekNumber: 1, dayNumber: 3, workoutId: workout.id },
        ],
      },
    })
    expect(program.status).toBe(201)
    expect(program.data.program.workoutDays).toBe(2)

    const assign = await call<Json>('/enrollments', {
      method: 'POST',
      cookie: admin,
      body: {
        userId: await memberId(admin),
        programId: program.data.program.id,
        startDate: '2026-11-09',
      },
    })
    expect(assign.status).toBe(201)

    const plan = await call<Json>('/me/plan', { cookie: member })
    expect(plan.data.plan.days).toHaveLength(28)
    expect(plan.data.plan.days[0]).toMatchObject({ date: '2026-11-09', workoutName: 'Leg Day A' })
    expect(plan.data.plan.days[1].state).toBe('rest')
  })

  it('shows an admin how someone is doing, and resets their program', async () => {
    const { admin, member } = await setupHousehold()
    const { workout, squat } = await library(admin)
    const program = await call<Json>('/programs', {
      method: 'POST',
      cookie: admin,
      body: {
        name: 'P',
        durationWeeks: 2,
        days: [{ weekNumber: 1, dayNumber: 1, workoutId: workout.id }],
      },
    })
    const userId = await memberId(admin)
    const enrol = await call<Json>('/enrollments', {
      method: 'POST',
      cookie: admin,
      body: { userId, programId: program.data.program.id, startDate: '2026-11-02' },
    })
    const day = await firstPlanDay(member)
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: member,
      body: {
        clientUuid: crypto.randomUUID(),
        workoutId: day.workoutId,
        enrollmentId: enrol.data.enrollment.id,
        programDayId: day.programDayId,
      },
    })
    await call(`/sessions/${s.data.session.id}/sets`, {
      method: 'PUT',
      cookie: member,
      body: {
        clientUuid: crypto.randomUUID(),
        exerciseId: squat,
        setNumber: 1,
        weightKg: 40,
        reps: 8,
      },
    })
    await call(`/sessions/${s.data.session.id}/finish`, {
      method: 'POST',
      cookie: member,
      body: { feeling: 4 },
    })

    expect((await call(`/admin/users/${userId}/progress`, { cookie: member })).status).toBe(403)
    const before = await call<Json>(`/admin/users/${userId}/progress`, { cookie: admin })
    expect(before.data.progress).toMatchObject({
      workoutDays: 1,
      done: 1,
      volumeKg: 320,
      avgFeeling: 4,
    })
    expect(before.data.progress.impact).toEqual({ sessions: 1, loggedSets: 1, checkins: 0 })

    const reset = await call(`/admin/users/${userId}/reset-program`, {
      method: 'POST',
      cookie: admin,
      body: { startDate: '2026-11-16' },
    })
    expect(reset.status).toBe(204)
    const after = await call<Json>(`/admin/users/${userId}/progress`, { cookie: admin })
    expect(after.data.progress).toMatchObject({ done: 0, volumeKg: 0 })
    expect(after.data.progress.impact).toEqual({ sessions: 0, loggedSets: 0, checkins: 0 })
    expect(after.data.progress.plan.enrollment.startDate).toBe('2026-11-16')
    expect((await call(`/sessions/${s.data.session.id}`, { cookie: member })).status).toBe(404)
  })

  it('removes a program from someone, with everything they logged on it', async () => {
    const { admin, member } = await setupHousehold()
    const { workout, squat } = await library(admin)
    const program = await call<Json>('/programs', {
      method: 'POST',
      cookie: admin,
      body: {
        name: 'P',
        durationWeeks: 1,
        days: [{ weekNumber: 1, dayNumber: 1, workoutId: workout.id }],
      },
    })
    const userId = await memberId(admin)
    const enrol = await call<Json>('/enrollments', {
      method: 'POST',
      cookie: admin,
      body: { userId, programId: program.data.program.id, startDate: '2026-11-02' },
    })
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: member,
      body: {
        clientUuid: crypto.randomUUID(),
        workoutId: (await firstPlanDay(member)).workoutId,
        enrollmentId: enrol.data.enrollment.id,
      },
    })
    await call(`/sessions/${s.data.session.id}/sets`, {
      method: 'PUT',
      cookie: member,
      body: {
        clientUuid: crypto.randomUUID(),
        exerciseId: squat,
        setNumber: 1,
        weightKg: 40,
        reps: 8,
      },
    })
    await call(`/sessions/${s.data.session.id}/finish`, {
      method: 'POST',
      cookie: member,
      body: {},
    })

    expect(
      (await call(`/admin/users/${userId}/program`, { method: 'DELETE', cookie: member })).status,
    ).toBe(403)
    expect(
      (await call(`/admin/users/${userId}/program`, { method: 'DELETE', cookie: admin })).status,
    ).toBe(204)
    expect(
      (await call<Json>(`/admin/users/${userId}/progress`, { cookie: admin })).data.progress,
    ).toBeNull()
    expect((await call(`/sessions/${s.data.session.id}`, { cookie: member })).status).toBe(404)
    expect((await call<Json>('/me/plan', { cookie: member })).data.plan).toBeNull()
    // The program itself stays in the library.
    expect((await call(`/programs/${program.data.program.id}`, { cookie: admin })).status).toBe(200)
    expect(
      (await call(`/admin/users/${userId}/program`, { method: 'DELETE', cookie: admin })).status,
    ).toBe(404)
  })

  it('archives a program with its history, re-enables it, and deletes a past one', async () => {
    const { admin, member } = await setupHousehold()
    const { workout } = await library(admin)
    const make = (name: string) =>
      call<Json>('/programs', {
        method: 'POST',
        cookie: admin,
        body: {
          name,
          durationWeeks: 1,
          days: [{ weekNumber: 1, dayNumber: 1, workoutId: workout.id }],
        },
      })
    const a = (await make('A')).data.program
    const b = (await make('B')).data.program
    const userId = await memberId(admin)
    const assign = (programId: number) =>
      call<Json>('/enrollments', {
        method: 'POST',
        cookie: admin,
        body: { userId, programId, startDate: '2026-11-02' },
      })
    const enrolA = (await assign(a.id)).data.enrollment
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: member,
      body: {
        clientUuid: crypto.randomUUID(),
        workoutId: (await firstPlanDay(member)).workoutId,
        enrollmentId: enrolA.id,
      },
    })
    await call(`/sessions/${s.data.session.id}/finish`, {
      method: 'POST',
      cookie: member,
      body: {},
    })

    // Archive: off the calendar, history kept.
    expect(
      (await call(`/admin/users/${userId}/program/archive`, { method: 'POST', cookie: admin }))
        .status,
    ).toBe(204)
    let view = await call<Json>(`/admin/users/${userId}/progress`, { cookie: admin })
    expect(view.data.progress).toBeNull()
    expect(view.data.past).toEqual([
      expect.objectContaining({ enrollmentId: enrolA.id, programName: 'A', workouts: 1 }),
    ])
    expect((await call(`/sessions/${s.data.session.id}`, { cookie: member })).status).toBe(200)

    // Re-enable is refused while another program is current.
    await assign(b.id)
    const blocked = await call(`/admin/users/${userId}/enrollments/${enrolA.id}/restore`, {
      method: 'POST',
      cookie: admin,
    })
    expect(blocked.status).toBe(409)
    await call(`/admin/users/${userId}/program/archive`, { method: 'POST', cookie: admin })
    const restored = await call(`/admin/users/${userId}/enrollments/${enrolA.id}/restore`, {
      method: 'POST',
      cookie: admin,
    })
    expect(restored.status).toBe(204)
    view = await call<Json>(`/admin/users/${userId}/progress`, { cookie: admin })
    expect(view.data.progress.plan.enrollment.programName).toBe('A')
    expect(view.data.progress.done).toBe(0) // no program day was linked to the session in this test
    expect(view.data.past.map((x: Json) => x.programName)).toEqual(['B'])

    // Delete a past program: gone with its data; members can't.
    const pastB = view.data.past[0].enrollmentId
    expect(
      (
        await call(`/admin/users/${userId}/enrollments/${pastB}`, {
          method: 'DELETE',
          cookie: member,
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await call(`/admin/users/${userId}/enrollments/${pastB}`, {
          method: 'DELETE',
          cookie: admin,
        })
      ).status,
    ).toBe(204)
    view = await call<Json>(`/admin/users/${userId}/progress`, { cookie: admin })
    expect(view.data.past).toEqual([])
  })

  it('keeps day ids when the grid changes, so history stays linked', async () => {
    const { admin } = await setupHousehold()
    const { workout } = await library(admin)
    const body = {
      name: 'P',
      durationWeeks: 1,
      days: [{ weekNumber: 1, dayNumber: 1, workoutId: workout.id }],
    }
    const created = await call<Json>('/programs', { method: 'POST', cookie: admin, body })
    const id = created.data.program.days[0].id
    const updated = await call<Json>(`/programs/${created.data.program.id}`, {
      method: 'PUT',
      cookie: admin,
      body: {
        ...body,
        days: [{ weekNumber: 1, dayNumber: 1, workoutId: workout.id, checkinRequired: true }],
      },
    })
    expect(updated.data.program.days[0]).toMatchObject({ id, checkinRequired: true })
  })

  it("clients can't assign programs, not even to themselves", async () => {
    const { admin, member } = await setupHousehold()
    const program = await call<Json>('/programs', {
      method: 'POST',
      cookie: admin,
      body: { name: 'Coach plan', durationWeeks: 1 },
    })
    const me = await call<Json>('/me', { cookie: member })
    const self = await call('/enrollments', {
      method: 'POST',
      cookie: member,
      body: {
        userId: me.data.user.id,
        programId: program.data.program.id,
        startDate: '2026-11-09',
      },
    })
    expect(self.status).toBe(403)
  })
})

describe('logging a workout', () => {
  it('starts, logs sets, finishes and spots a new record', async () => {
    const { admin } = await setupHousehold()
    const { workout, squat } = await library(admin)

    async function session(weight: number) {
      const start = await call<Json>('/sessions', {
        method: 'POST',
        cookie: admin,
        body: { clientUuid: crypto.randomUUID(), workoutId: workout.id },
      })
      expect(start.status).toBe(201)
      const id = start.data.session.id
      for (const setNumber of [1, 2]) {
        const set = await call(`/sessions/${id}/sets`, {
          method: 'PUT',
          cookie: admin,
          body: {
            clientUuid: crypto.randomUUID(),
            exerciseId: squat,
            setNumber,
            weightKg: weight,
            reps: 8,
          },
        })
        expect(set.status).toBe(200)
      }
      return call<Json>(`/sessions/${id}/finish`, {
        method: 'POST',
        cookie: admin,
        body: { feeling: 4 },
      })
    }

    const first = await session(40)
    expect(first.data.session).toMatchObject({ volumeKg: 640, setCount: 2 })
    expect(first.data.records).toHaveLength(0)

    const second = await session(45)
    expect(second.data.records).toEqual([
      { exerciseId: squat, exerciseName: 'Squat', weightKg: 45 },
    ])

    const stats = await call<Json>('/me/stats', { cookie: admin })
    expect(stats.data.stats.workouts).toBe(2)
    expect(stats.data.stats.records[0]).toMatchObject({ exerciseName: 'Squat', bestWeightKg: 45 })
  })

  it('shows last time’s sets when starting again', async () => {
    const { admin } = await setupHousehold()
    const { workout, squat } = await library(admin)
    const a = await call<Json>('/sessions', {
      method: 'POST',
      cookie: admin,
      body: { clientUuid: crypto.randomUUID(), workoutId: workout.id },
    })
    await call(`/sessions/${a.data.session.id}/sets`, {
      method: 'PUT',
      cookie: admin,
      body: {
        clientUuid: crypto.randomUUID(),
        exerciseId: squat,
        setNumber: 1,
        weightKg: 50,
        reps: 6,
      },
    })
    await call(`/sessions/${a.data.session.id}/finish`, { method: 'POST', cookie: admin, body: {} })
    const b = await call<Json>('/sessions', {
      method: 'POST',
      cookie: admin,
      body: { clientUuid: crypto.randomUUID(), workoutId: workout.id },
    })
    expect(b.data.session.previous[squat]).toEqual([
      { setNumber: 1, weightKg: 50, reps: 6, durationSeconds: null, distanceM: null },
    ])
  })

  it('saving the same set twice updates it instead of duplicating', async () => {
    const { admin } = await setupHousehold()
    const { workout, squat } = await library(admin)
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: admin,
      body: { clientUuid: crypto.randomUUID(), workoutId: workout.id },
    })
    const set = {
      clientUuid: crypto.randomUUID(),
      exerciseId: squat,
      setNumber: 1,
      weightKg: 40,
      reps: 8,
    }
    await call(`/sessions/${s.data.session.id}/sets`, { method: 'PUT', cookie: admin, body: set })
    await call(`/sessions/${s.data.session.id}/sets`, {
      method: 'PUT',
      cookie: admin,
      body: { ...set, reps: 10 },
    })
    const detail = await call<Json>(`/sessions/${s.data.session.id}`, { cookie: admin })
    expect(detail.data.session.sets).toHaveLength(1)
    expect(detail.data.session.sets[0].reps).toBe(10)
  })

  it('restarts a workout: clears its sets and resets the clock', async () => {
    const { admin, member } = await setupHousehold()
    const { workout, squat } = await library(admin)
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: admin,
      body: { clientUuid: crypto.randomUUID(), workoutId: workout.id },
    })
    const id = s.data.session.id
    await call(`/sessions/${id}/sets`, {
      method: 'PUT',
      cookie: admin,
      body: {
        clientUuid: crypto.randomUUID(),
        exerciseId: squat,
        setNumber: 1,
        weightKg: 40,
        reps: 8,
      },
    })
    expect((await call(`/sessions/${id}/restart`, { method: 'POST', cookie: member })).status).toBe(
      404,
    )
    const restarted = await call<Json>(`/sessions/${id}/restart`, { method: 'POST', cookie: admin })
    expect(restarted.status).toBe(200)
    expect(restarted.data.session.sets).toHaveLength(0)
    expect(Date.parse(restarted.data.session.startedAt)).toBeGreaterThanOrEqual(
      Date.parse(s.data.session.startedAt),
    )
    await call(`/sessions/${id}/finish`, { method: 'POST', cookie: admin, body: {} })
    expect((await call(`/sessions/${id}/restart`, { method: 'POST', cookie: admin })).status).toBe(
      409,
    )
  })

  it("never shows or changes someone else's session", async () => {
    const { admin, member } = await setupHousehold()
    const { workout, squat } = await library(admin)
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: admin,
      body: { clientUuid: crypto.randomUUID(), workoutId: workout.id },
    })
    const id = s.data.session.id
    expect((await call(`/sessions/${id}`, { cookie: member })).status).toBe(404)
    const write = await call(`/sessions/${id}/sets`, {
      method: 'PUT',
      cookie: member,
      body: {
        clientUuid: crypto.randomUUID(),
        exerciseId: squat,
        setNumber: 1,
        weightKg: 1,
        reps: 1,
      },
    })
    expect(write.status).toBe(404)
    expect(
      (await call(`/sessions/${id}/finish`, { method: 'POST', cookie: member, body: {} })).status,
    ).toBe(404)
    const memberStats = await call<Json>('/me/stats', { cookie: member })
    expect(memberStats.data.stats.workouts).toBe(0)
  })
})

describe('deleting workouts and programs for good', () => {
  async function loggedProgram(admin: string) {
    const { workout, squat } = await library(admin)
    const program = await call<Json>('/programs', {
      method: 'POST',
      cookie: admin,
      body: {
        name: 'P',
        durationWeeks: 1,
        days: [{ weekNumber: 1, dayNumber: 1, workoutId: workout.id }],
      },
    })
    const me = await call<Json>('/me', { cookie: admin })
    const enrol = await call<Json>('/enrollments', {
      method: 'POST',
      cookie: admin,
      body: {
        userId: me.data.user.id,
        programId: program.data.program.id,
        startDate: '2026-11-09',
      },
    })
    // Assigning made a personal copy; history hangs off the copy.
    const day = await firstPlanDay(admin)
    const session = await call<Json>('/sessions', {
      method: 'POST',
      cookie: admin,
      body: {
        clientUuid: crypto.randomUUID(),
        workoutId: day.workoutId,
        enrollmentId: enrol.data.enrollment.id,
        programDayId: day.programDayId,
      },
    })
    await call(`/sessions/${session.data.session.id}/sets`, {
      method: 'PUT',
      cookie: admin,
      body: {
        clientUuid: crypto.randomUUID(),
        exerciseId: squat,
        setNumber: 1,
        weightKg: 40,
        reps: 8,
      },
    })
    await call(`/sessions/${session.data.session.id}/finish`, {
      method: 'POST',
      cookie: admin,
      body: {},
    })
    const copy = await call<Json>(`/programs/${day.programId}`, { cookie: admin })
    return {
      workout: { id: day.workoutId },
      program: copy.data.program,
      library: program.data.program,
      libraryWorkout: workout,
      sessionId: session.data.session.id,
    }
  }

  it('reports what a workout delete removes, then removes it', async () => {
    const { admin } = await setupHousehold()
    const { workout, program, sessionId } = await loggedProgram(admin)
    const impact = await call<Json>(`/workouts/${workout.id}/impact`, { cookie: admin })
    expect(impact.data.impact).toMatchObject({
      programs: [{ id: program.id, name: 'P' }],
      sessions: 1,
      loggedSets: 1,
    })

    // Still scheduled in a program: refused, and the program is untouched.
    const blocked = await call<{ error: string }>(`/workouts/${workout.id}/permanent`, {
      method: 'DELETE',
      cookie: admin,
    })
    expect(blocked.status).toBe(409)
    expect(blocked.data.error).toContain('P')
    expect(
      (await call<Json>(`/programs/${program.id}`, { cookie: admin })).data.program.workoutDays,
    ).toBe(1)

    // Delete the program first, then the workout goes with its history.
    expect(
      (await call(`/programs/${program.id}/permanent`, { method: 'DELETE', cookie: admin })).status,
    ).toBe(204)
    expect(
      (await call<Json>(`/workouts/${workout.id}/impact`, { cookie: admin })).data.impact.programs,
    ).toEqual([])
    expect(
      (await call(`/workouts/${workout.id}/permanent`, { method: 'DELETE', cookie: admin })).status,
    ).toBe(204)
    expect((await call(`/workouts/${workout.id}`, { cookie: admin })).status).toBe(404)
    expect((await call(`/sessions/${sessionId}`, { cookie: admin })).status).toBe(404)
  })

  it('deletes a program with its assignments and logged sessions', async () => {
    const { admin } = await setupHousehold()
    const { workout, program, sessionId } = await loggedProgram(admin)
    const impact = await call<Json>(`/programs/${program.id}/impact`, { cookie: admin })
    expect(impact.data.impact).toMatchObject({ people: ['Pieter'], sessions: 1, loggedSets: 1 })

    expect(
      (await call(`/programs/${program.id}/permanent`, { method: 'DELETE', cookie: admin })).status,
    ).toBe(204)
    expect((await call(`/programs/${program.id}`, { cookie: admin })).status).toBe(404)
    expect((await call(`/sessions/${sessionId}`, { cookie: admin })).status).toBe(404)
    expect((await call<Json>('/me/plan', { cookie: admin })).data.plan).toBeNull()
    // The workout itself is kept.
    expect((await call(`/workouts/${workout.id}`, { cookie: admin })).status).toBe(200)
  })

  it("won't let a client delete library workouts", async () => {
    const { admin, member } = await setupHousehold()
    const { workout } = await library(admin)
    const res = await call(`/workouts/${workout.id}/permanent`, {
      method: 'DELETE',
      cookie: member,
    })
    expect(res.status).toBe(403)
  })
})
