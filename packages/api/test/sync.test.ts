// "Update their copies": bringing many clients' program copies up to date in one go.
import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, signIn } from './helpers'

type Json = Record<string, any>

const CLIENTS = 25
const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }

const row = (exerciseId: number, targetSets: number) => ({
  exerciseId,
  targetSets,
  targetRepsMin: 8,
  targetRepsMax: 10,
  restSeconds: 90,
})

async function setup() {
  await createAdmin()
  const owner = await signIn(ADMIN.email, ADMIN.password)
  const exercise = async (name: string) =>
    (
      await call<Json>('/exercises', {
        method: 'POST',
        cookie: owner,
        body: { name, muscleGroup: 'legs' },
      })
    ).data.exercise.id as number
  const squat = await exercise('Squat')
  const lunge = await exercise('Lunge')
  const workout = async (name: string, exercises: Json[]) =>
    (await call<Json>('/workouts', { method: 'POST', cookie: owner, body: { name, exercises } }))
      .data.workout.id as number
  const legs = await workout('Legs', [row(squat, 3)])
  const lunges = await workout('Lunges', [row(lunge, 3)])
  const program = (
    await call<Json>('/programs', {
      method: 'POST',
      cookie: owner,
      body: {
        name: 'Base',
        durationWeeks: 2,
        days: [
          { weekNumber: 1, dayNumber: 1, workoutId: legs },
          { weekNumber: 1, dayNumber: 3, workoutId: lunges },
          { weekNumber: 2, dayNumber: 1, workoutId: legs },
        ],
      },
    })
  ).data.program.id as number
  const clients: number[] = []
  for (let i = 1; i <= CLIENTS; i++) {
    const email = `client${i}@example.com`
    await call('/admin/users', {
      method: 'POST',
      cookie: owner,
      body: { name: `Client ${i}`, email, password: 'client-password-1' },
    })
    const people = (await call<Json>('/admin/users', { cookie: owner })).data.users as Json[]
    const id = people.find((u) => u.email === email)?.id as number
    await call('/enrollments', {
      method: 'POST',
      cookie: owner,
      body: { userId: id, programId: program, startDate: '2026-11-09' },
    })
    clients.push(id)
  }
  return { owner, squat, lunge, legs, lunges, program, clients }
}

const planOf = async (cookie: string, userId: number) =>
  (await call<Json>(`/admin/users/${userId}/progress`, { cookie })).data.progress.plan

const dayOf = (plan: Json, week: number, day: number): Json =>
  (plan.days as Json[]).find((d) => d.weekNumber === week && d.dayNumber === day) ?? {}

describe('updating many clients’ copies', () => {
  it('brings every copy up to date, keeping their days and dropping unused copies', async () => {
    const { owner, squat, lunge, legs, program, clients } = await setup()
    const before = await planOf(owner, clients[0] as number)
    const dayIdBefore = dayOf(before, 1, 1).programDayId
    const oldLungesCopy = dayOf(before, 1, 3).workoutId as number

    // Change the library: more sets on Legs, Lunges off the schedule, a new workout on day 5.
    await call(`/workouts/${legs}`, {
      method: 'PUT',
      cookie: owner,
      body: { name: 'Legs v2', exercises: [row(squat, 5)] },
    })
    const fresh = (
      await call<Json>('/workouts', {
        method: 'POST',
        cookie: owner,
        body: { name: 'Fresh', exercises: [row(lunge, 4)] },
      })
    ).data.workout.id as number
    await call(`/programs/${program}`, {
      method: 'PUT',
      cookie: owner,
      body: {
        name: 'Base v2',
        durationWeeks: 2,
        days: [
          { weekNumber: 1, dayNumber: 1, workoutId: legs },
          { weekNumber: 1, dayNumber: 5, workoutId: fresh },
          { weekNumber: 2, dayNumber: 1, workoutId: legs },
        ],
      },
    })

    const copies = (await call<Json>(`/programs/${program}/copies`, { cookie: owner })).data
      .copies as Json[]
    expect(copies).toHaveLength(CLIENTS)
    expect(copies.every((c) => c.behind)).toBe(true)

    const res = await call<Json>(`/programs/${program}/sync`, {
      method: 'POST',
      cookie: owner,
      body: { enrollmentIds: copies.map((c) => c.enrollmentId) },
    })
    expect(res.status).toBe(200)
    expect((res.data.copies as Json[]).every((c) => !c.behind)).toBe(true)

    for (const userId of clients) {
      const plan = await planOf(owner, userId)
      expect(plan.enrollment.programName).toBe('Base v2')
      const monday = dayOf(plan, 1, 1)
      expect(monday.workoutName).toBe('Legs v2')
      expect(monday.workoutId).not.toBe(legs)
      expect(dayOf(plan, 1, 3).workoutId ?? null).toBeNull()
      expect(dayOf(plan, 1, 5).workoutName).toBe('Fresh')
      expect(dayOf(plan, 1, 5).workoutId).not.toBe(fresh)
      // The same workout copy on both Legs days.
      expect(dayOf(plan, 2, 1).workoutId).toBe(monday.workoutId)
      const copy = (await call<Json>(`/workouts/${monday.workoutId}`, { cookie: owner })).data
        .workout
      expect(copy.clientId).toBe(userId)
      expect(copy.exercises[0].targetSets).toBe(5)
    }

    // The first client's day kept its id (sessions point at it); the Lunges copy is gone.
    const after = await planOf(owner, clients[0] as number)
    expect(dayOf(after, 1, 1).programDayId).toBe(dayIdBefore)
    expect((await call(`/workouts/${oldLungesCopy}`, { cookie: owner })).status).toBe(404)
  })

  it('refuses the whole update if one of the clients isn’t yours', async () => {
    const { owner, squat, clients } = await setup()
    await call('/admin/users', {
      method: 'POST',
      cookie: owner,
      body: { ...COACH, role: 'admin' },
    })
    const kim = await signIn(COACH.email, COACH.password)
    // Kim's own program, on Kim's client Sam and on one of the owner's clients.
    const kimWorkout = (
      await call<Json>('/workouts', {
        method: 'POST',
        cookie: kim,
        body: { name: 'Kim legs', exercises: [row(squat, 3)] },
      })
    ).data.workout.id as number
    const kimProgram = (
      await call<Json>('/programs', {
        method: 'POST',
        cookie: kim,
        body: {
          name: 'Kim base',
          durationWeeks: 1,
          days: [{ weekNumber: 1, dayNumber: 1, workoutId: kimWorkout }],
        },
      })
    ).data.program.id as number
    await call('/admin/users', {
      method: 'POST',
      cookie: kim,
      body: { name: 'Sam', email: 'sam@example.com', password: 'client-password-1' },
    })
    const people = (await call<Json>('/admin/users', { cookie: owner })).data.users as Json[]
    const sam = people.find((u) => u.email === 'sam@example.com')?.id as number
    const theirs = clients[0] as number
    for (const [cookie, userId] of [
      [kim, sam],
      [owner, theirs],
    ] as const) {
      await call('/enrollments', {
        method: 'POST',
        cookie,
        body: { userId, programId: kimProgram, startDate: '2026-11-09' },
      })
    }
    await call(`/programs/${kimProgram}`, {
      method: 'PUT',
      cookie: kim,
      body: {
        name: 'Kim base v2',
        durationWeeks: 1,
        days: [{ weekNumber: 1, dayNumber: 1, workoutId: kimWorkout }],
      },
    })
    // The owner sees both copies; Kim sends both ids, one of them not her client's.
    const copies = (await call<Json>(`/programs/${kimProgram}/copies`, { cookie: owner })).data
      .copies as Json[]
    expect(copies).toHaveLength(2)
    const res = await call(`/programs/${kimProgram}/sync`, {
      method: 'POST',
      cookie: kim,
      body: { enrollmentIds: copies.map((c) => c.enrollmentId) },
    })
    expect(res.status).toBe(404)
    // Nothing changed for either of them.
    expect((await planOf(owner, sam)).enrollment.programName).toBe('Kim base')
    expect((await planOf(owner, theirs)).enrollment.programName).toBe('Kim base')
  })
})
