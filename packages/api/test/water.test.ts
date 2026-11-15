import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, setupHousehold, signIn } from './helpers'

type Json = Record<string, any>

const DAY = '2026-11-14'
const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }

const drink = (cookie: string, ml: number, clientUuid: string = crypto.randomUUID()) =>
  call<Json>('/me/water', { method: 'POST', cookie, body: { clientUuid, date: DAY, ml } })

describe('water', () => {
  it('adds up what someone drank, saves a retry once, and undoes the last glass', async () => {
    const { member } = await setupHousehold()
    const uuid = crypto.randomUUID()
    expect((await drink(member, 250, uuid)).status).toBe(201)
    await drink(member, 250, uuid) // the phone retried
    const after = await drink(member, 500)
    expect(after.data.water).toMatchObject({ date: DAY, goalMl: null, ml: 750 })
    expect(after.data.water.logs).toHaveLength(2)

    const last = after.data.water.logs.at(-1).id
    const undone = await call<Json>(`/me/water/${last}`, { method: 'DELETE', cookie: member })
    expect(undone.data.water.ml).toBe(250)

    const summary = await call<Json>(`/me/water/summary?from=${DAY}&to=${DAY}`, { cookie: member })
    expect(summary.data.summary.days).toEqual([{ date: DAY, ml: 250 }])
  })

  it('the coach sets a goal, the client can change it, and either can clear it', async () => {
    const { admin, member } = await setupHousehold()
    const me = (await call<Json>('/me', { cookie: member })).data.user
    const set = await call<Json>(`/admin/users/${me.id}/water/goal`, {
      method: 'PUT',
      cookie: admin,
      body: { goalMl: 3000 },
    })
    expect(set.data.goalMl).toBe(3000)
    expect((await call<Json>(`/me/water?date=${DAY}`, { cookie: member })).data.water.goalMl).toBe(
      3000,
    )

    await call('/me/water/goal', { method: 'PUT', cookie: member, body: { goalMl: 2510 } })
    const seen = await call<Json>(`/admin/users/${me.id}/water?date=${DAY}`, { cookie: admin })
    expect(seen.data.water.goalMl).toBe(2500)

    await call('/me/water/goal', { method: 'PUT', cookie: member, body: { goalMl: null } })
    expect((await call<Json>(`/me/water?date=${DAY}`, { cookie: member })).data.water.goalMl).toBe(
      null,
    )
    const silly = await call('/me/water/goal', {
      method: 'PUT',
      cookie: member,
      body: { goalMl: 50 },
    })
    expect(silly.status).toBe(400)
  })

  it('only ever shows and changes your own water', async () => {
    const { admin, member } = await setupHousehold()
    const uuid = crypto.randomUUID()
    const mine = await drink(admin, 500, uuid)
    const id = mine.data.water.logs[0].id
    expect((await call(`/me/water/${id}`, { method: 'DELETE', cookie: member })).status).toBe(404)
    // Someone else's id from the phone: refused, never added to the wrong person.
    expect((await drink(member, 250, uuid)).status).toBe(409)
    const theirs = await call<Json>(`/me/water?date=${DAY}`, { cookie: member })
    expect(theirs.data.water.ml).toBe(0)
    expect((await call<Json>(`/me/water?date=${DAY}`, { cookie: admin })).data.water.ml).toBe(500)
  })

  it('lets only the staff who manage a client see their water and set the goal', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
    const created = await call<Json>('/admin/users', {
      method: 'POST',
      cookie: owner,
      body: MEMBER,
    })
    const clientId = created.data.user.id
    const client = await signIn(MEMBER.email, MEMBER.password)
    const coach = await signIn(COACH.email, COACH.password)
    await drink(client, 250)

    const seen = await call<Json>(`/admin/users/${clientId}/water?date=${DAY}`, { cookie: owner })
    expect(seen.data.water.ml).toBe(250)
    expect(
      (await call(`/admin/users/${clientId}/water?date=${DAY}`, { cookie: coach })).status,
    ).toBe(404)
    const goal = { goalMl: 3000 }
    expect(
      (
        await call(`/admin/users/${clientId}/water/goal`, {
          method: 'PUT',
          cookie: coach,
          body: goal,
        })
      ).status,
    ).toBe(404)
    // A client can't reach the admin routes at all, not even for themselves.
    expect(
      (
        await call(`/admin/users/${clientId}/water/goal`, {
          method: 'PUT',
          cookie: client,
          body: goal,
        })
      ).status,
    ).toBe(403)
  })
})
