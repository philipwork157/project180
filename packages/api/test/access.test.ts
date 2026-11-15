import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, setupHousehold, signIn, signInAsIs } from './helpers'

type Json = Record<string, any>

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }

const person = async (cookie: string, email: string) =>
  (await call<Json>('/admin/users', { cookie })).data.users.find((u: Json) => u.email === email)

const signInStatus = async (email: string, password: string) =>
  (await call('/auth/sign-in/email', { method: 'POST', body: { email, password } })).status

describe('active now', () => {
  it('ends as soon as they sign out, not five minutes later', async () => {
    const { admin, member } = await setupHousehold()
    await call('/me/plan', { cookie: member })
    expect(await person(admin, MEMBER.email)).toMatchObject({ signedIn: true, blocked: false })

    await call('/auth/sign-out', { method: 'POST', cookie: member, body: {} })
    const after = await person(admin, MEMBER.email)
    expect(after.signedIn).toBe(false)
    // Still remembered as "seen" a moment ago, just not active.
    expect(after.lastSeenAt).not.toBeNull()
    const { id } = after
    const activity = await call<Json>(`/admin/users/${id}/activity`, { cookie: admin })
    expect(activity.data.activity).toMatchObject({ activeNow: false, devices: [] })
  })
})

describe('blocking access', () => {
  it('signs them out everywhere, refuses their password, and unblocking lets them back', async () => {
    const { admin, member } = await setupHousehold()
    const { id } = await person(admin, MEMBER.email)

    const block = await call<Json>(`/admin/users/${id}/access`, {
      method: 'POST',
      cookie: admin,
      body: { blocked: true },
    })
    expect(block.data).toEqual({ blocked: true })
    // The phone they were on is signed out straight away.
    expect((await call('/me/plan', { cookie: member })).status).toBe(401)
    expect(await person(admin, MEMBER.email)).toMatchObject({ blocked: true, signedIn: false })

    // The right password gets the paused message and no session; a wrong one says nothing more.
    const refused = await call<Json>('/auth/sign-in/email', {
      method: 'POST',
      body: { email: MEMBER.email, password: MEMBER.password },
    })
    expect(refused.status).toBe(403)
    expect(refused.data.code).toBe('BLOCKED')
    expect(refused.headers.get('set-cookie') ?? '').not.toContain('session_token=')
    expect(await signInStatus(MEMBER.email, 'wrong-password-1')).toBe(401)

    // Their data is kept: unblock and they're straight back in.
    await call(`/admin/users/${id}/access`, {
      method: 'POST',
      cookie: admin,
      body: { blocked: false },
    })
    const back = await signInAsIs(MEMBER.email, MEMBER.password)
    expect((await call('/me', { cookie: back })).status).toBe(200)
    expect((await person(admin, MEMBER.email)).blocked).toBe(false)
  })

  it('never yourself or an owner; coaches only their own clients, and never a coach', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
    await call('/admin/users', { method: 'POST', cookie: owner, body: MEMBER })
    const coach = await signIn(COACH.email, COACH.password)
    const OTHER = { name: 'Other Owner', email: 'other@example.com', password: 'other-password-1' }
    await createAdmin(OTHER)

    const ids = {
      me: (await person(owner, ADMIN.email)).id,
      kim: (await person(owner, COACH.email)).id,
      wife: (await person(owner, MEMBER.email)).id,
      other: (await person(owner, OTHER.email)).id,
    }
    const block = async (cookie: string, id: number) =>
      (
        await call(`/admin/users/${id}/access`, {
          method: 'POST',
          cookie,
          body: { blocked: true },
        })
      ).status

    expect(await block(owner, ids.me)).toBe(403)
    expect(await block(owner, ids.other)).toBe(403)
    // The owner's client isn't Kim's: she can't even see them.
    expect(await block(coach, ids.wife)).toBe(404)
    expect(await block(coach, ids.me)).toBe(404)
    expect(await block(coach, ids.kim)).toBe(403)
    // An owner may block a coach.
    expect(await block(owner, ids.kim)).toBe(200)
    expect(await signInStatus(COACH.email, COACH.password)).toBe(403)
  })
})
