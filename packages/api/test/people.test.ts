// The People page list: paged, searched and sorted on the server, and only ever your people.
import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, signIn } from './helpers'

type Json = Record<string, any>

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }
const KIM_CLIENTS = 30

async function team() {
  await createAdmin()
  const owner = await signIn(ADMIN.email, ADMIN.password)
  await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
  const kim = await signIn(COACH.email, COACH.password)
  await call('/admin/users', { method: 'POST', cookie: owner, body: MEMBER })
  for (let i = 1; i <= KIM_CLIENTS; i++) {
    await call('/admin/users', {
      method: 'POST',
      cookie: kim,
      body: {
        name: `Client ${String(i).padStart(2, '0')}`,
        email: `client${i}@example.com`,
        password: 'client-password-1',
      },
    })
  }
  return { owner, kim }
}

const list = (cookie: string, query = '') =>
  call<Json>(`/admin/users/directory${query ? `?${query}` : ''}`, { cookie })

describe('the People list', () => {
  it('pages on the server and counts each tab', async () => {
    const { kim } = await team()
    const first = (await list(kim, 'sort=name')).data
    expect(first.total).toBe(KIM_CLIENTS)
    expect(first.people).toHaveLength(25)
    expect(first.people[0].name).toBe('Client 01')
    expect(first.counts).toEqual({ mine: KIM_CLIENTS, clients: KIM_CLIENTS, team: 1 })
    const second = (await list(kim, 'sort=name&page=2')).data
    expect(second.people.map((p: Json) => p.name)).toEqual([
      'Client 26',
      'Client 27',
      'Client 28',
      'Client 29',
      'Client 30',
    ])
  })

  it('searches by name or email, with % and _ taken literally', async () => {
    const { kim } = await team()
    const byName = (await list(kim, 'q=client%201')).data
    // Client 10 to Client 19 ("Client 01" has a 0 in between).
    expect(byName.total).toBe(10)
    const byEmail = (await list(kim, 'q=client7%40')).data
    expect(byEmail.people.map((p: Json) => p.name)).toEqual(['Client 07'])
    expect((await list(kim, 'q=%25')).data.total).toBe(0)
    expect((await list(kim, 'q=_')).data.total).toBe(0)
  })

  it('the me view is only ever yourself, for coaches and owners', async () => {
    const { owner, kim } = await team()
    const coach = (await list(kim, 'view=me')).data
    expect(coach.people.map((p: Json) => p.email)).toEqual([COACH.email])
    expect(coach.total).toBe(1)
    const own = (await list(owner, 'view=me')).data
    expect(own.people.map((p: Json) => p.email)).toEqual([ADMIN.email])
    // A search that doesn't match you hides your row.
    expect((await list(kim, 'view=me&q=client')).data.total).toBe(0)
  })

  it('a coach can’t move the start date of someone they don’t coach', async () => {
    const { owner, kim } = await team()
    const theirs = (await list(owner, `view=mine&q=${encodeURIComponent(MEMBER.email)}`)).data
    const id = theirs.people[0].id
    const res = await call(`/admin/users/${id}/program/start-date`, {
      method: 'POST',
      cookie: kim,
      body: { startDate: '2026-11-16' },
    })
    expect(res.status).toBe(404)
  })

  it('a coach only ever sees their own clients, whatever they ask for', async () => {
    const { owner, kim } = await team()
    for (const view of ['mine', 'clients', 'team']) {
      const page = (await list(kim, `view=${view}&q=wife`)).data
      expect(page.total).toBe(0)
    }
    const all = (await list(kim, 'view=clients')).data
    expect(all.people.every((p: Json) => p.email.startsWith('client'))).toBe(true)
    // The owner sees everyone; the team tab holds staff only.
    const staff = (await list(owner, 'view=team')).data
    expect(staff.people.map((p: Json) => p.email).sort()).toEqual([ADMIN.email, COACH.email].sort())
    expect(staff.people.find((p: Json) => p.email === COACH.email).clientCount).toBe(KIM_CLIENTS)
    const clients = (await list(owner, 'view=clients')).data
    expect(clients.total).toBe(KIM_CLIENTS + 1)
    // Clients can't use it at all.
    const wife = await signIn(MEMBER.email, MEMBER.password)
    expect((await list(wife)).status).toBe(403)
  })

  it('shows each client’s program and last workout', async () => {
    const { kim } = await team()
    const ex = await call<Json>('/exercises', {
      method: 'POST',
      cookie: kim,
      body: { name: 'Squat', muscleGroup: 'legs' },
    })
    const w = await call<Json>('/workouts', {
      method: 'POST',
      cookie: kim,
      body: {
        name: 'Legs',
        exercises: [{ exerciseId: ex.data.exercise.id, targetSets: 3, restSeconds: 90 }],
      },
    })
    const p = await call<Json>('/programs', {
      method: 'POST',
      cookie: kim,
      body: {
        name: 'Base',
        durationWeeks: 1,
        days: [{ weekNumber: 1, dayNumber: 1, workoutId: w.data.workout.id }],
      },
    })
    const target = (await list(kim, 'q=client3%40')).data.people[0]
    await call('/enrollments', {
      method: 'POST',
      cookie: kim,
      body: { userId: target.id, programId: p.data.program.id, startDate: '2026-11-09' },
    })
    const sam = await signIn('client3@example.com', 'client-password-1')
    const plan = await call<Json>('/me/plan', { cookie: sam })
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: sam,
      body: { clientUuid: crypto.randomUUID(), workoutId: plan.data.plan.days[0].workoutId },
    })
    await call(`/sessions/${s.data.session.id}/finish`, { method: 'POST', cookie: sam, body: {} })
    const row = (await list(kim, 'q=client3%40')).data.people[0]
    expect(row.programName).toBe('Base')
    expect(row.lastWorkoutAt).not.toBeNull()
    const other = (await list(kim, 'q=client4%40')).data.people[0]
    expect(other).toMatchObject({ programName: null, lastWorkoutAt: null })
  })
})
