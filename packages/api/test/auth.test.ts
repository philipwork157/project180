import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, setupHousehold, signIn } from './helpers'

describe('creating accounts', () => {
  it('has no first-run setup any more', async () => {
    expect((await call('/setup')).status).toBe(404)
    expect((await call('/setup', { method: 'POST', body: ADMIN })).status).toBe(404)
  })

  it('creates an admin with the admin script, who can sign in', async () => {
    await createAdmin()
    const cookie = await signIn(ADMIN.email, ADMIN.password)
    const me = await call<{ user: { role: string } }>('/me', { cookie })
    expect(me.data.user.role).toBe('owner')
  })

  it('running the admin script again promotes and resets, without duplicates', async () => {
    const { admin } = await setupHousehold()
    await createAdmin({ ...MEMBER, password: 'wife-new-password' })
    const list = await call<{ users: Array<{ email: string; role: string }> }>('/admin/users', {
      cookie: admin,
    })
    expect(list.data.users.filter((u) => u.email === MEMBER.email)).toEqual([
      expect.objectContaining({ role: 'owner' }),
    ])
    await expect(signIn(MEMBER.email, MEMBER.password)).rejects.toThrow()
    await expect(signIn(MEMBER.email, 'wife-new-password')).resolves.toContain('=')
  })
})

describe('sign-in', () => {
  it('signs in with email and password and returns the user', async () => {
    await createAdmin()
    const cookie = await signIn(ADMIN.email, ADMIN.password)
    const me = await call<{ user: { id: number; role: string; email: string } }>('/me', { cookie })
    expect(me.status).toBe(200)
    expect(me.data.user).toMatchObject({ role: 'owner', email: ADMIN.email })
    expect(typeof me.data.user.id).toBe('number')
  })

  it('refuses a wrong password', async () => {
    await createAdmin()
    const res = await call('/auth/sign-in/email', {
      method: 'POST',
      body: { email: ADMIN.email, password: 'wrong-password' },
    })
    expect(res.status).toBe(401)
  })

  it('has no public sign-up', async () => {
    await createAdmin()
    const res = await call('/auth/sign-up/email', {
      method: 'POST',
      body: { name: 'Stranger', email: 'stranger@example.com', password: 'stranger-pass-1' },
    })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('answers 401 without a session', async () => {
    const res = await call('/me')
    expect(res.status).toBe(401)
  })
})

describe('admin users', () => {
  it('lets the admin add a member, who can sign in', async () => {
    const { member } = await setupHousehold()
    const me = await call<{ user: { role: string } }>('/me', { cookie: member })
    expect(me.data.user.role).toBe('member')
  })

  it('blocks members from the admin area', async () => {
    const { member } = await setupHousehold()
    const list = await call('/admin/users', { cookie: member })
    expect(list.status).toBe(403)
  })

  it('refuses a duplicate email', async () => {
    const { admin } = await setupHousehold()
    const dup = await call('/admin/users', { method: 'POST', cookie: admin, body: MEMBER })
    expect(dup.status).toBe(409)
  })

  it('resets a password', async () => {
    const { admin } = await setupHousehold()
    const list = await call<{ users: Array<{ id: number; email: string }> }>('/admin/users', {
      cookie: admin,
    })
    const wife = list.data.users.find((u) => u.email === MEMBER.email)
    const reset = await call(`/admin/users/${wife?.id}/password`, {
      method: 'POST',
      cookie: admin,
      body: { password: 'brand-new-password' },
    })
    expect(reset.status).toBe(204)
    await expect(signIn(MEMBER.email, 'brand-new-password')).resolves.toContain('=')
  })
})
