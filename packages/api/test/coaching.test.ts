import { env } from 'cloudflare:test'
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
  it('copies a program of several workouts, each once, with its rows and groups', async () => {
    const { coach, byEmail } = await team()
    const { exerciseId, workout } = await workoutAndProgram(coach)
    const second = await call<Json>('/workouts', {
      method: 'POST',
      cookie: coach,
      body: {
        name: 'Upper',
        exercises: [
          { exerciseId, targetSets: 3, restSeconds: 60, supersetGroup: 1 },
          { exerciseId, targetSets: 2, restSeconds: 60, supersetGroup: 1 },
        ],
        groups: [{ groupNumber: 1, kind: 'superset', rounds: 3 }],
      },
    })
    expect(second.status).toBe(201)
    // 4 weeks x 2 days, two workouts used many times: still one copy of each.
    const days = [1, 2, 3, 4].flatMap((weekNumber) => [
      { weekNumber, dayNumber: 1, workoutId: workout.id },
      { weekNumber, dayNumber: 3, workoutId: second.data.workout.id },
    ])
    const p = await call<Json>('/programs', {
      method: 'POST',
      cookie: coach,
      body: { name: 'Block', durationWeeks: 4, days },
    })
    const sam = await byEmail(CLIENT.email)
    const assign = await call('/enrollments', {
      method: 'POST',
      cookie: coach,
      body: { userId: sam.id, programId: p.data.program.id, startDate: '2026-11-09' },
    })
    expect(assign.status).toBe(201)
    const view = await call<Json>(`/admin/users/${sam.id}/progress`, { cookie: coach })
    const copy = await call<Json>(`/programs/${view.data.progress.plan.enrollment.programId}`, {
      cookie: coach,
    })
    expect(copy.data.program.days).toHaveLength(8)
    const copyIds = [...new Set(copy.data.program.days.map((d: Json) => d.workoutId))]
    expect(copyIds).toHaveLength(2)
    expect(copyIds).not.toContain(workout.id)
    expect(copyIds).not.toContain(second.data.workout.id)
    const upper = await call<Json>(`/workouts/${copy.data.program.days[1].workoutId}`, {
      cookie: coach,
    })
    expect(upper.data.workout).toMatchObject({ name: 'Upper', clientId: sam.id })
    expect(upper.data.workout.exercises).toHaveLength(2)
    expect(upper.data.workout.groups).toEqual([
      expect.objectContaining({ groupNumber: 1, kind: 'superset', rounds: 3 }),
    ])
  })

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
    // The bell's "new program" news: who assigned it and when (a moment ago).
    expect(plan.data.plan.assigned.coachName).toBe(COACH.name)
    expect(Date.now() - Date.parse(plan.data.plan.assigned.at)).toBeLessThan(60_000)
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

const later = (ms = 5) => new Promise((r) => setTimeout(r, ms))

/** Sam on the coach's program, with their copy's ids and first workout day. */
async function samOnProgram() {
  const t = await team()
  const lib = await workoutAndProgram(t.coach)
  const sam = await t.byEmail(CLIENT.email)
  await call('/enrollments', {
    method: 'POST',
    cookie: t.coach,
    body: { userId: sam.id, programId: lib.program.id, startDate: '2026-11-09' },
  })
  const enrollment = (await call<Json>(`/admin/users/${sam.id}/progress`, { cookie: t.coach })).data
    .progress.plan.enrollment
  const copy = (await call<Json>(`/programs/${enrollment.programId}`, { cookie: t.coach })).data
    .program
  const day = copy.days.find((d: Json) => d.workoutId !== null)
  return { ...t, ...lib, sam, enrollment, copy, day }
}

const copiesOf = async (cookie: string, programId: number) =>
  (await call<Json>(`/programs/${programId}/copies`, { cookie })).data.copies as Json[]

describe('updating clients on a program', () => {
  it('brings library changes into their copy and keeps their start date and progress', async () => {
    const { coach, program, workout, exerciseId, enrollment, copy, day, sam } = await samOnProgram()
    expect(await copiesOf(coach, program.id)).toMatchObject([
      { enrollmentId: enrollment.id, behind: false, changedForThem: false },
    ])
    await later()
    // The library workout gets 5 sets and the program a second day.
    await call(`/workouts/${workout.id}`, {
      method: 'PUT',
      cookie: coach,
      body: {
        name: 'Legs v2',
        exercises: [
          { exerciseId, targetSets: 5, targetRepsMin: 5, targetRepsMax: 5, restSeconds: 120 },
        ],
      },
    })
    await call(`/programs/${program.id}`, {
      method: 'PUT',
      cookie: coach,
      body: {
        name: 'Base v2',
        durationWeeks: 2,
        days: [
          { weekNumber: 1, dayNumber: 1, workoutId: workout.id },
          { weekNumber: 2, dayNumber: 3, workoutId: workout.id },
        ],
      },
    })
    expect((await copiesOf(coach, program.id))[0]).toMatchObject({ behind: true })

    const sync = await call<Json>(`/programs/${program.id}/sync`, {
      method: 'POST',
      cookie: coach,
      body: { enrollmentIds: [enrollment.id] },
    })
    expect(sync.status).toBe(200)
    expect(sync.data.copies[0]).toMatchObject({ behind: false, changedForThem: false })

    const after = (await call<Json>(`/programs/${copy.id}`, { cookie: coach })).data.program
    expect(after).toMatchObject({ id: copy.id, name: 'Base v2', durationWeeks: 2 })
    const slots = after.days.filter((d: Json) => d.workoutId !== null)
    expect(slots.map((d: Json) => [d.weekNumber, d.dayNumber])).toEqual([
      [1, 1],
      [2, 3],
    ])
    // Same day row and same workout copy, so logged sessions still line up.
    expect(slots[0].id).toBe(day.id)
    expect(slots.every((d: Json) => d.workoutId === day.workoutId)).toBe(true)
    const theirWorkout = (await call<Json>(`/workouts/${day.workoutId}`, { cookie: coach })).data
      .workout
    expect(theirWorkout).toMatchObject({ name: 'Legs v2' })
    expect(theirWorkout.exercises[0].targetSets).toBe(5)

    const progress = await call<Json>(`/admin/users/${sam.id}/progress`, { cookie: coach })
    expect(progress.data.progress.plan.enrollment).toMatchObject({
      id: enrollment.id,
      startDate: '2026-11-09',
    })
  })

  it('flags copies that were changed just for them', async () => {
    const { coach, program, exerciseId, day } = await samOnProgram()
    await later(1100)
    await call(`/workouts/${day.workoutId}`, {
      method: 'PUT',
      cookie: coach,
      body: {
        name: 'Legs (easier)',
        exercises: [
          { exerciseId, targetSets: 2, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 60 },
        ],
      },
    })
    expect((await copiesOf(coach, program.id))[0]).toMatchObject({ changedForThem: true })
  })

  it('re-assigning the same program can update instead of starting over', async () => {
    const { coach, program, sam, enrollment } = await samOnProgram()
    const res = await call<Json>('/enrollments', {
      method: 'POST',
      cookie: coach,
      body: { userId: sam.id, programId: program.id, startDate: '2026-12-01', mode: 'update' },
    })
    expect(res.status).toBe(200)
    expect(res.data.enrollment).toMatchObject({ id: enrollment.id, startDate: '2026-11-09' })
    // Not on that program: nothing to update.
    const other = await workoutAndProgram(coach)
    const wrong = await call('/enrollments', {
      method: 'POST',
      cookie: coach,
      body: {
        userId: sam.id,
        programId: other.program.id,
        startDate: '2026-12-01',
        mode: 'update',
      },
    })
    expect(wrong.status).toBe(409)
  })

  it("a coach can't see or update anyone else's clients on a program", async () => {
    const { owner, coach, byEmail } = await team()
    const { program } = await workoutAndProgram(owner)
    const wife = await byEmail(MEMBER.email)
    const enrol = await call<Json>('/enrollments', {
      method: 'POST',
      cookie: owner,
      body: { userId: wife.id, programId: program.id, startDate: '2026-11-09' },
    })
    expect(await copiesOf(owner, program.id)).toHaveLength(1)
    expect((await call(`/programs/${program.id}/copies`, { cookie: coach })).status).toBe(404)
    const sync = await call(`/programs/${program.id}/sync`, {
      method: 'POST',
      cookie: coach,
      body: { enrollmentIds: [enrol.data.enrollment.id] },
    })
    expect(sync.status).toBe(404)
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

describe('deleting a person', () => {
  it('only an owner can, and never themselves or another owner', async () => {
    const { owner, coach, byEmail } = await team()
    const sam = await byEmail(CLIENT.email)
    const me = await byEmail(ADMIN.email)
    expect((await call(`/admin/users/${sam.id}`, { method: 'DELETE', cookie: coach })).status).toBe(
      403,
    )
    const client = await signIn(MEMBER.email, MEMBER.password)
    expect(
      (await call(`/admin/users/${sam.id}`, { method: 'DELETE', cookie: client })).status,
    ).toBe(403)
    expect((await call(`/admin/users/${me.id}`, { method: 'DELETE', cookie: owner })).status).toBe(
      403,
    )
    expect((await call('/admin/users/999999', { method: 'DELETE', cookie: owner })).status).toBe(
      404,
    )
    expect(await byEmail(CLIENT.email)).toBeTruthy()
  })

  it('removes a client and everything they logged', async () => {
    const { owner, coach, byEmail } = await team()
    const { program, exerciseId } = await workoutAndProgram(coach)
    const sam = await byEmail(CLIENT.email)
    await call('/enrollments', {
      method: 'POST',
      cookie: coach,
      body: { userId: sam.id, programId: program.id, startDate: '2026-11-09' },
    })
    const client = await signIn(CLIENT.email, CLIENT.password)
    const plan = await call<Json>('/me/plan', { cookie: client })
    const day = plan.data.plan.days.find((d: Json) => d.workoutId !== null)
    const started = await call<Json>('/sessions', {
      method: 'POST',
      cookie: client,
      body: {
        clientUuid: crypto.randomUUID(),
        workoutId: day.workoutId,
        enrollmentId: plan.data.plan.enrollment.id,
        programDayId: day.programDayId,
      },
    })
    const sessionId = started.data.session.id
    await call(`/sessions/${sessionId}/sets`, {
      method: 'PUT',
      cookie: client,
      body: { clientUuid: crypto.randomUUID(), exerciseId, setNumber: 1, weightKg: 40, reps: 8 },
    })
    await call(`/sessions/${sessionId}/finish`, { method: 'POST', cookie: client, body: {} })
    await call('/me/checkins', {
      method: 'PUT',
      cookie: client,
      body: { clientUuid: crypto.randomUUID(), date: '2026-11-10', weightKg: 80 },
    })

    const res = await call<Json>(`/admin/users/${sam.id}`, { method: 'DELETE', cookie: owner })
    expect(res.status).toBe(200)
    expect(res.data.removed).toEqual({ workouts: 1, checkins: 1 })
    expect(await byEmail(CLIENT.email)).toBeUndefined()
    // Signed out everywhere, and the account can't sign in again.
    expect((await call('/me', { cookie: client })).status).toBe(401)
    const again = await call('/auth/sign-in/email', {
      method: 'POST',
      body: { email: CLIENT.email, password: CLIENT.password },
    })
    expect(again.status).toBe(401)
    // The coach's library program is untouched; only the client's copy went.
    expect((await call(`/programs/${program.id}`, { cookie: coach })).status).toBe(200)
    for (const table of [
      'workouts',
      'programs',
      'workout_sessions',
      'body_checkins',
      'enrollments',
    ]) {
      const column = table === 'workouts' || table === 'programs' ? 'client_id' : 'user_id'
      const left = await env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${column} = ?`)
        .bind(sam.id)
        .first<{ n: number }>()
      expect(left?.n, table).toBe(0)
    }
  })

  it('removing a coach hands their clients and library to the owner', async () => {
    const { owner, byEmail } = await team()
    const kim = await byEmail(COACH.email)
    const coach = await signIn(COACH.email, COACH.password)
    const { program, workout } = await workoutAndProgram(coach)
    const sam = await byEmail(CLIENT.email)
    await call('/enrollments', {
      method: 'POST',
      cookie: coach,
      body: { userId: sam.id, programId: program.id, startDate: '2026-11-09' },
    })

    const res = await call<Json>(`/admin/users/${kim.id}`, { method: 'DELETE', cookie: owner })
    expect(res.status).toBe(200)
    expect(res.data.handedOver).toEqual({ clients: 1, exercises: 1, workouts: 1, programs: 1 })
    const me = await byEmail(ADMIN.email)
    expect((await byEmail(CLIENT.email)).coachId).toBe(me.id)
    expect((await call(`/workouts/${workout.id}`, { cookie: owner })).status).toBe(200)
    expect((await call(`/programs/${program.id}`, { cookie: owner })).status).toBe(200)
    // The client keeps their program and history.
    const progress = await call<Json>(`/admin/users/${sam.id}/progress`, { cookie: owner })
    expect(progress.data.progress.plan.enrollment.sourceProgramId).toBe(program.id)
  })
})
