import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, setupHousehold } from './helpers'

const cookiesOf = (res: { headers: Headers }) =>
  (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie().map((c) => c.split(';')[0])

async function signInTo(app: 'app' | 'admin', email: string, password: string) {
  const res = await call('/auth/sign-in/email', {
    method: 'POST',
    body: { email, password },
    asAdminApp: app === 'admin',
  })
  return { res, cookie: cookiesOf(res).join('; ') }
}

describe('the app and the admin have separate sign-ins', () => {
  it('uses a different cookie for each', async () => {
    await createAdmin()
    const app = await signInTo('app', ADMIN.email, ADMIN.password)
    const admin = await signInTo('admin', ADMIN.email, ADMIN.password)
    expect(app.cookie).toMatch(/^better-auth\.session_token=/)
    expect(admin.cookie).toMatch(/^project180-admin\.session_token=/)
  })

  it('does not count an app sign-in on the admin, or the other way round', async () => {
    await createAdmin()
    const app = await signInTo('app', ADMIN.email, ADMIN.password)
    const admin = await signInTo('admin', ADMIN.email, ADMIN.password)
    expect((await call('/me', { cookie: app.cookie, asAdminApp: true })).status).toBe(401)
    expect((await call('/me', { cookie: admin.cookie })).status).toBe(401)
    expect((await call('/me', { cookie: admin.cookie, asAdminApp: true })).status).toBe(200)
  })

  it('refuses a client on the admin without making a session', async () => {
    await setupHousehold()
    const { res, cookie } = await signInTo('admin', MEMBER.email, MEMBER.password)
    expect(res.status).toBe(403)
    expect(cookie).not.toMatch(/session_token=[^;]/)
  })

  it('only offers the Better Auth endpoints the apps use', async () => {
    const { member } = await setupHousehold()
    const res = await call('/auth/update-user', {
      method: 'POST',
      cookie: member,
      body: { name: 'Someone else' },
    })
    expect(res.status).toBe(404)
  })
})
