import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, setupHousehold, signIn, signInAsIs } from './helpers'

type Me = { id: number; mustChangePassword: boolean }
type Activity = {
  lastSeenAt: string | null
  activeNow: boolean
  mustChangePassword: boolean
  days: { date: string; seconds: number }[]
  devices: { id: number; label: string; current: boolean }[]
}

async function adminAndNewClient() {
  await createAdmin()
  const admin = await signIn(ADMIN.email, ADMIN.password)
  const created = await call<{ user: Me }>('/admin/users', {
    method: 'POST',
    cookie: admin,
    body: MEMBER,
  })
  expect(created.status).toBe(201)
  return { admin, clientId: created.data.user.id }
}

const signInStatus = async (email: string, password: string) =>
  (await call('/auth/sign-in/email', { method: 'POST', body: { email, password } })).status

describe('temporary passwords', () => {
  it('makes a new client choose their own password before anything else', async () => {
    await adminAndNewClient()
    const cookie = await signInAsIs(MEMBER.email, MEMBER.password)

    const me = await call<{ user: Me }>('/me', { cookie })
    expect(me.data.user.mustChangePassword).toBe(true)
    const blocked = await call<{ code: string }>('/me/plan', { cookie })
    expect(blocked.status).toBe(403)
    expect(blocked.data.code).toBe('CHOOSE_PASSWORD')

    const same = await call('/me/first-password', {
      method: 'POST',
      cookie,
      body: { password: MEMBER.password },
    })
    expect(same.status).toBe(400)
    const short = await call('/me/first-password', {
      method: 'POST',
      cookie,
      body: { password: 'short' },
    })
    expect(short.status).toBe(400)

    const chosen = await call<{ user: Me }>('/me/first-password', {
      method: 'POST',
      cookie,
      body: { password: 'my-own-password' },
    })
    expect(chosen.status).toBe(200)
    expect(chosen.data.user.mustChangePassword).toBe(false)
    // Still signed in on this device, and now free to use the app.
    expect((await call('/me/plan', { cookie })).status).toBe(200)
    expect(
      (
        await call('/me/first-password', {
          method: 'POST',
          cookie,
          body: { password: 'another-one-1' },
        })
      ).status,
    ).toBe(409)

    expect(await signInStatus(MEMBER.email, MEMBER.password)).toBe(401)
    expect(await signInStatus(MEMBER.email, 'my-own-password')).toBe(200)
  })

  it('signs out other devices still on the temporary password', async () => {
    await adminAndNewClient()
    const phone = await signInAsIs(MEMBER.email, MEMBER.password)
    const laptop = await signInAsIs(MEMBER.email, MEMBER.password)
    await call('/me/first-password', {
      method: 'POST',
      cookie: phone,
      body: { password: 'my-own-password' },
    })
    expect((await call('/me', { cookie: phone })).status).toBe(200)
    expect((await call('/me', { cookie: laptop })).status).toBe(401)
  })

  it('a coach reset signs them out and makes the new password temporary', async () => {
    const { admin, member } = await setupHousehold()
    const me = await call<{ user: Me }>('/me', { cookie: member })
    const reset = await call(`/admin/users/${me.data.user.id}/password`, {
      method: 'POST',
      cookie: admin,
      body: { password: 'temporary-again' },
    })
    expect(reset.status).toBe(204)
    expect((await call('/me', { cookie: member })).status).toBe(401)

    const cookie = await signInAsIs(MEMBER.email, 'temporary-again')
    expect((await call<{ user: Me }>('/me', { cookie })).data.user.mustChangePassword).toBe(true)
  })

  it('setting your own password as a coach is not temporary', async () => {
    await createAdmin()
    const admin = await signIn(ADMIN.email, ADMIN.password)
    const me = await call<{ user: Me }>('/me', { cookie: admin })
    await call(`/admin/users/${me.data.user.id}/password`, {
      method: 'POST',
      cookie: admin,
      body: { password: 'owner-new-password' },
    })
    expect((await call('/me', { cookie: admin })).status).toBe(200)
    const again = await signInAsIs(ADMIN.email, 'owner-new-password')
    expect((await call<{ user: Me }>('/me', { cookie: again })).data.user.mustChangePassword).toBe(
      false,
    )
  })
})

describe('sign-in limit', () => {
  it('pauses an email after 5 wrong passwords, even with the right one', async () => {
    await createAdmin()
    for (let i = 0; i < 5; i++) expect(await signInStatus(ADMIN.email, 'wrong-password')).toBe(401)
    const locked = await call<{ message: string }>('/auth/sign-in/email', {
      method: 'POST',
      body: { email: ADMIN.email, password: ADMIN.password },
    })
    expect(locked.status).toBe(429)
    expect(locked.data.message).toMatch(/Too many tries/)
    // Other people are not affected.
    expect(await signInStatus('someone@example.com', 'whatever-1')).toBe(401)
  })

  it('a right password clears the count', async () => {
    await createAdmin()
    for (let i = 0; i < 4; i++) await signInStatus(ADMIN.email, 'wrong-password')
    expect(await signInStatus(ADMIN.email, ADMIN.password)).toBe(200)
    for (let i = 0; i < 4; i++) expect(await signInStatus(ADMIN.email, 'wrong-password')).toBe(401)
    expect(await signInStatus(ADMIN.email, ADMIN.password)).toBe(200)
  })
})

describe('activity', () => {
  it('adds up time in the app and shows when they were last seen', async () => {
    const { admin, member } = await setupHousehold()
    const me = await call<{ user: Me }>('/me', { cookie: member })
    expect(
      (await call('/me/heartbeat', { method: 'POST', cookie: member, body: { seconds: 60 } }))
        .status,
    ).toBe(204)
    await call('/me/heartbeat', { method: 'POST', cookie: member, body: { seconds: 45 } })
    expect(
      (await call('/me/heartbeat', { method: 'POST', cookie: member, body: { seconds: 5000 } }))
        .status,
    ).toBe(400)

    const res = await call<{ activity: Activity }>(`/admin/users/${me.data.user.id}/activity`, {
      cookie: admin,
    })
    expect(res.status).toBe(200)
    const { activity } = res.data
    expect(activity.days).toHaveLength(7)
    expect(activity.days.at(-1)?.seconds).toBe(105)
    expect(activity.activeNow).toBe(true)
    expect(activity.lastSeenAt).not.toBeNull()
    expect(activity.devices).toHaveLength(1)
    expect(activity.devices[0]?.current).toBe(false)

    const list = await call<{ users: { email: string; lastSeenAt: string | null }[] }>(
      '/admin/users',
      { cookie: admin },
    )
    expect(list.data.users.find((u) => u.email === MEMBER.email)?.lastSeenAt).not.toBeNull()
  })

  it('is for staff only', async () => {
    const { member } = await setupHousehold()
    const me = await call<{ user: Me }>('/me', { cookie: member })
    expect(
      (await call(`/admin/users/${me.data.user.id}/activity`, { cookie: member })).status,
    ).toBe(403)
  })
})

describe('signing people out', () => {
  it('signs a client out on one device', async () => {
    const { admin, member } = await setupHousehold()
    const other = await signIn(MEMBER.email, MEMBER.password)
    const me = await call<{ user: Me }>('/me', { cookie: member })
    const id = me.data.user.id
    const { activity } = (
      await call<{ activity: Activity }>(`/admin/users/${id}/activity`, { cookie: admin })
    ).data
    expect(activity.devices).toHaveLength(2)
    const res = await call(`/admin/users/${id}/sessions/${activity.devices[0]?.id}`, {
      method: 'DELETE',
      cookie: admin,
    })
    expect(res.status).toBe(204)
    const after = [
      (await call('/me', { cookie: member })).status,
      (await call('/me', { cookie: other })).status,
    ]
    expect(after.sort()).toEqual([200, 401])
  })

  it('signs a client out everywhere', async () => {
    const { admin, member } = await setupHousehold()
    const other = await signIn(MEMBER.email, MEMBER.password)
    const id = (await call<{ user: Me }>('/me', { cookie: member })).data.user.id
    const res = await call<{ signedOut: number }>(`/admin/users/${id}/sign-out-everywhere`, {
      method: 'POST',
      cookie: admin,
    })
    expect(res.data.signedOut).toBe(2)
    expect((await call('/me', { cookie: member })).status).toBe(401)
    expect((await call('/me', { cookie: other })).status).toBe(401)
  })

  it('signing yourself out everywhere keeps this device', async () => {
    await createAdmin()
    const here = await signIn(ADMIN.email, ADMIN.password)
    const there = await signIn(ADMIN.email, ADMIN.password)
    const id = (await call<{ user: Me }>('/me', { cookie: here })).data.user.id
    const res = await call<{ signedOut: number }>(`/admin/users/${id}/sign-out-everywhere`, {
      method: 'POST',
      cookie: here,
    })
    expect(res.data.signedOut).toBe(1)
    expect((await call('/me', { cookie: here })).status).toBe(200)
    expect((await call('/me', { cookie: there })).status).toBe(401)
  })
})
