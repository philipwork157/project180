import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, signIn } from './helpers'

type Json = Record<string, any>

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }
const CLIENT = { name: 'Client Sam', email: 'sam@example.com', password: 'client-password-1' }

/** Owner (from the script), a coach the owner adds, and one client each. */
async function team() {
  await createAdmin()
  const owner = await signIn(ADMIN.email, ADMIN.password)
  await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
  const coach = await signIn(COACH.email, COACH.password)
  await call('/admin/users', { method: 'POST', cookie: owner, body: MEMBER })
  await call('/admin/users', { method: 'POST', cookie: coach, body: CLIENT })
  const ids = async (cookie: string) =>
    (await call<Json>('/admin/users', { cookie })).data.users.map((u: Json) => u.email).sort()
  const byEmail = async (email: string) =>
    (await call<Json>('/admin/users', { cookie: owner })).data.users.find(
      (u: Json) => u.email === email,
    )
  return { owner, coach, ids, byEmail }
}

async function workoutAndProgram(cookie: string) {
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
      exercises: [
        {
          exerciseId: ex.data.exercise.id,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 10,
          restSeconds: 90,
        },
      ],
    },
  })
  const p = await call<Json>('/programs', {
    method: 'POST',
    cookie,
    body: {
      name: 'Base',
      durationWeeks: 1,
      days: [{ weekNumber: 1, dayNumber: 1, workoutId: w.data.workout.id }],
    },
  })
  return {
    exerciseId: ex.data.exercise.id as number,
    workout: w.data.workout,
    program: p.data.program,
  }
}

describe('coaches and clients', () => {
  it('owners see everyone; a coach sees only themselves and their own clients', async () => {
    const { owner, coach, ids } = await team()
    expect(await ids(owner)).toEqual([ADMIN.email, COACH.email, CLIENT.email, MEMBER.email].sort())
    expect(await ids(coach)).toEqual([COACH.email, CLIENT.email].sort())
  })

  it("a coach can't see, assign or change someone else's client", async () => {
    const { coach, byEmail, owner } = await team()
    const wife = await byEmail(MEMBER.email)
    expect((await call(`/admin/users/${wife.id}/progress`, { cookie: coach })).status).toBe(404)
    expect(
      (
        await call(`/admin/users/${wife.id}/password`, {
          method: 'POST',
          cookie: coach,
          body: { password: 'hijacked-123' },
        })
      ).status,
    ).toBe(404)
    const { program } = await workoutAndProgram(owner)
    const assign = await call('/enrollments', {
      method: 'POST',
      cookie: coach,
      body: { userId: wife.id, programId: program.id, startDate: '2026-11-09' },
    })
    expect(assign.status).toBe(404)
  })

  it('new clients belong to the coach who added them; only owners add coaches', async () => {
    const { coach, byEmail } = await team()
    const sam = await byEmail(CLIENT.email)
    const kim = await byEmail(COACH.email)
    expect(sam).toMatchObject({ role: 'member', coachId: kim.id, coachName: COACH.name })
    const sneaky = await call('/admin/users', {
      method: 'POST',
      cookie: coach,
      body: { name: 'X', email: 'x@example.com', password: 'longenough1', role: 'admin' },
    })
    expect(sneaky.status).toBe(403)
  })

  it('an owner can hand a client to another coach', async () => {
    const { owner, coach, byEmail, ids } = await team()
    const wife = await byEmail(MEMBER.email)
    const kim = await byEmail(COACH.email)
    expect(
      (
        await call(`/admin/users/${wife.id}/coach`, {
          method: 'PATCH',
          cookie: coach,
          body: { coachId: kim.id },
        })
      ).status,
    ).toBe(403)
    expect(
      (
        await call(`/admin/users/${wife.id}/coach`, {
          method: 'PATCH',
          cookie: owner,
          body: { coachId: kim.id },
        })
      ).status,
    ).toBe(204)
    expect(await ids(coach)).toContain(MEMBER.email)
  })
})

describe('personal program copies', () => {
  it('assigning gives the client their own copy; the library stays clean and untouched', async () => {
    const { coach, byEmail } = await team()
    const { program, workout, exerciseId } = await workoutAndProgram(coach)
    const sam = await byEmail(CLIENT.email)
    await call('/enrollments', {
      method: 'POST',
      cookie: coach,
      body: { userId: sam.id, programId: program.id, startDate: '2026-11-09' },
    })
    const view = await call<Json>(`/admin/users/${sam.id}/progress`, { cookie: coach })
    const copyId = view.data.progress.plan.enrollment.programId
    expect(copyId).not.toBe(program.id)
    expect(view.data.progress.plan.enrollment.sourceProgramId).toBe(program.id)

    // The library lists don't show copies.
    const programs = await call<Json>('/programs', { cookie: coach })
    expect(programs.data.programs.map((p: Json) => p.id)).toEqual([program.id])
    const workouts = await call<Json>('/workouts', { cookie: coach })
    expect(workouts.data.workouts.map((w: Json) => w.id)).toEqual([workout.id])

    // Editing Sam's workout copy changes only Sam's.
    const copy = await call<Json>(`/programs/${copyId}`, { cookie: coach })
    expect(copy.data.program).toMatchObject({ clientId: sam.id, clientName: CLIENT.name })
    const copyWorkoutId = copy.data.program.days[0].workoutId
    expect(copyWorkoutId).not.toBe(workout.id)
    await call(`/workouts/${copyWorkoutId}`, {
      method: 'PUT',
      cookie: coach,
      body: { name: 'Legs', exercises: [{ exerciseId, targetSets: 5, restSeconds: 60 }] },
    })
    const original = await call<Json>(`/workouts/${workout.id}`, { cookie: coach })
    expect(original.data.workout.exercises[0].targetSets).toBe(3)

    // Sam can see and do their own workout.
    const samCookie = await signIn(CLIENT.email, CLIENT.password)
    const plan = await call<Json>('/me/plan', { cookie: samCookie })
    expect(plan.data.plan.days[0].workoutId).toBe(copyWorkoutId)
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: samCookie,
      body: { clientUuid: crypto.randomUUID(), workoutId: copyWorkoutId },
    })
    expect(s.status).toBe(201)
    expect(s.data.session.exercises[0].targetSets).toBe(5)
  })

  it('library workouts dropped into a client copy are copied for them', async () => {
    const { coach, byEmail } = await team()
    const { program, workout } = await workoutAndProgram(coach)
    const sam = await byEmail(CLIENT.email)
    await call('/enrollments', {
      method: 'POST',
      cookie: coach,
      body: { userId: sam.id, programId: program.id, startDate: '2026-11-09' },
    })
    const copyId = (await call<Json>(`/admin/users/${sam.id}/progress`, { cookie: coach })).data
      .progress.plan.enrollment.programId
    const saved = await call<Json>(`/programs/${copyId}`, {
      method: 'PUT',
      cookie: coach,
      body: {
        name: 'Base',
        durationWeeks: 1,
        days: [
          { weekNumber: 1, dayNumber: 1, workoutId: workout.id },
          { weekNumber: 1, dayNumber: 3, workoutId: workout.id },
        ],
      },
    })
    const ids = saved.data.program.days
      .filter((d: Json) => d.workoutId !== null)
      .map((d: Json) => d.workoutId)
    expect(ids).toHaveLength(2)
    expect(ids.every((id: number) => id !== workout.id)).toBe(true)
    // Their workouts are listed for their program builder, but not in the plain library.
    const forSam = await call<Json>(`/workouts?clientId=${sam.id}`, { cookie: coach })
    expect(forSam.data.workouts.some((w: Json) => w.clientId === sam.id)).toBe(true)
  })

  it('removing the program deletes their copy too, never the library one', async () => {
    const { coach, byEmail } = await team()
    const { program } = await workoutAndProgram(coach)
    const sam = await byEmail(CLIENT.email)
    await call('/enrollments', {
      method: 'POST',
      cookie: coach,
      body: { userId: sam.id, programId: program.id, startDate: '2026-11-09' },
    })
    const copyId = (await call<Json>(`/admin/users/${sam.id}/progress`, { cookie: coach })).data
      .progress.plan.enrollment.programId
    expect(
      (await call(`/admin/users/${sam.id}/program`, { method: 'DELETE', cookie: coach })).status,
    ).toBe(204)
    expect((await call(`/programs/${copyId}`, { cookie: coach })).status).toBe(404)
    expect((await call(`/programs/${program.id}`, { cookie: coach })).status).toBe(200)
  })
})

describe('what was prescribed, and groups', () => {
  it('a session keeps the targets it started with, even after the workout changes', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    const { workout, exerciseId } = await workoutAndProgram(owner)
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: owner,
      body: { clientUuid: crypto.randomUUID(), workoutId: workout.id },
    })
    await call(`/workouts/${workout.id}`, {
      method: 'PUT',
      cookie: owner,
      body: { name: 'Legs', exercises: [{ exerciseId, targetSets: 6, restSeconds: 30 }] },
    })
    const again = await call<Json>(`/sessions/${s.data.session.id}`, { cookie: owner })
    expect(again.data.session.exercises[0]).toMatchObject({
      targetSets: 3,
      targetRepsMin: 8,
      restSeconds: 90,
    })
  })

  it('saves supersets and intervals, drops unused groups, and passes them to sessions', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    const mk = async (name: string) =>
      (
        await call<Json>('/exercises', {
          method: 'POST',
          cookie: owner,
          body: { name, muscleGroup: 'full_body', trackingType: 'time' },
        })
      ).data.exercise.id
    const [a, b, c] = [await mk('Burpees'), await mk('Squat jumps'), await mk('Plank')]
    const w = await call<Json>('/workouts', {
      method: 'POST',
      cookie: owner,
      body: {
        name: 'Tabata',
        exercises: [
          { exerciseId: a, targetSets: 8, supersetGroup: 1 },
          { exerciseId: b, targetSets: 8, supersetGroup: 1 },
          { exerciseId: c, targetSets: 2 },
        ],
        groups: [
          { groupNumber: 1, kind: 'interval', rounds: 8, workSeconds: 20, restSeconds: 10 },
          { groupNumber: 7, kind: 'superset', rounds: 3 },
        ],
      },
    })
    expect(w.status).toBe(201)
    expect(w.data.workout.groups).toEqual([
      { groupNumber: 1, kind: 'interval', rounds: 8, workSeconds: 20, restSeconds: 10 },
    ])
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: owner,
      body: { clientUuid: crypto.randomUUID(), workoutId: w.data.workout.id },
    })
    expect(s.data.session.groups).toEqual([
      { groupNumber: 1, kind: 'interval', rounds: 8, workSeconds: 20, restSeconds: 10 },
    ])
    expect(s.data.session.exercises.map((e: Json) => e.supersetGroup)).toEqual([1, 1, null])
  })
})
