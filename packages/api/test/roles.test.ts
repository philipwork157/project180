// The walls between roles, in one place: the platform admin sees only platform pages (never a
// gym's data), coaches and owners never see platform pages, clients never get into the admin,
// and one client never reaches another client's data. If any of these fail, something leaks.
import { describe, expect, it } from 'vitest'
import {
  ADMIN,
  call,
  createAdmin,
  MEMBER,
  setupHousehold,
  signIn,
  signInAdminApp,
  signInPlatform,
} from './helpers'

const COACH = { name: 'Coach', email: 'coach@example.com', password: 'coach-password-1' }

type Json = Record<string, any>

const OTHER_CLIENT = { name: 'Bea', email: 'bea@example.com', password: 'client-password-2' }

const PLATFORM_ROUTES = [
  '/platform/people',
  '/platform/claude',
  '/platform/costs',
  '/platform/coaches',
  '/platform/health',
  '/platform/starter',
  '/platform/audit',
  '/platform/errors',
  '/platform/sign-ins',
  '/platform/database',
  '/admin/email',
]

describe('who can see what', () => {
  it('coaches and owners never reach a platform page', async () => {
    await setupHousehold()
    // Signed in to the dashboard itself: the phone app's cookie would only ever get a 401 there.
    const owner = await signInAdminApp(ADMIN.email, ADMIN.password)
    await createAdmin(COACH, 'admin')
    const coach = await signInAdminApp(COACH.email, COACH.password)
    for (const cookie of [owner, coach]) {
      for (const path of PLATFORM_ROUTES) {
        const res = await call(path, { cookie, asAdminApp: true })
        expect([403, 404], path).toContain(res.status)
      }
    }
  })

  it('clients can’t sign in to the admin, and get nothing from coach or platform pages', async () => {
    const { member } = await setupHousehold()
    const admin = await call('/auth/sign-in/email', {
      method: 'POST',
      body: { email: MEMBER.email, password: MEMBER.password },
      asAdminApp: true,
    })
    expect(admin.status).toBe(403)
    expect(admin.data).toMatchObject({ code: 'STAFF_ONLY' })
    for (const path of [
      '/admin/users',
      '/admin/overview',
      '/admin/invitations',
      ...PLATFORM_ROUTES,
    ]) {
      const res = await call(path, { cookie: member })
      expect([401, 403, 404], path).toContain(res.status)
    }
    // Their app cookie doesn't work in the admin either.
    expect((await call('/me', { cookie: member, asAdminApp: true })).status).toBe(401)
  })

  it('the platform admin sees platform pages but no gym’s people, training or food', async () => {
    const { admin } = await setupHousehold()
    const me = (await call<Json>('/me', { cookie: admin })).data.user
    const platform = await signInPlatform()
    for (const path of PLATFORM_ROUTES) {
      expect((await call(path, { cookie: platform, asAdminApp: true })).status, path).toBe(200)
    }
    for (const path of [
      '/admin/users',
      '/admin/overview',
      `/admin/users/${me.id}/food`,
      `/admin/users/${me.id}/check-ins`,
      '/workouts',
      '/programs',
    ]) {
      const res = await call(path, { cookie: platform, asAdminApp: true })
      expect([403, 404], path).toContain(res.status)
    }
  })

  it('one client never reaches another client’s data', async () => {
    const { admin, member } = await setupHousehold()
    await call('/admin/users', { method: 'POST', cookie: admin, body: OTHER_CLIENT })
    const other = await signIn(OTHER_CLIENT.email, OTHER_CLIENT.password)
    const otherId = (await call<Json>('/me', { cookie: other })).data.user.id

    // Something of each kind the other client owns.
    const today = new Date().toISOString().slice(0, 10)
    const food = await call<Json>('/me/food', {
      method: 'POST',
      cookie: other,
      body: {
        date: today,
        meal: 'lunch',
        entries: [
          { clientUuid: crypto.randomUUID(), name: 'Secret salad', kcal: 300, proteinG: 20 },
        ],
      },
    })
    const foodId = food.data.day.entries[0].id
    const water = await call<Json>('/me/water', {
      method: 'POST',
      cookie: other,
      body: { clientUuid: crypto.randomUUID(), date: today, ml: 500 },
    })
    const waterId = water.data.water.logs[0].id
    await call('/me/food/favourites', {
      method: 'POST',
      cookie: other,
      body: { name: 'Secret salad', kcal: 300, proteinG: 20 },
    })

    // The first client sees none of it and can change none of it.
    const mine = await call<Json>(`/me/food?date=${today}`, { cookie: member })
    expect(JSON.stringify(mine.data)).not.toContain('Secret salad')
    expect((await call<Json>('/me/food/favourites', { cookie: member })).data.favourites).toEqual(
      [],
    )
    expect(
      (await call(`/me/food/${foodId}`, { method: 'PATCH', cookie: member, body: { kcal: 1 } }))
        .status,
    ).toBe(404)
    expect((await call(`/me/food/${foodId}`, { method: 'DELETE', cookie: member })).status).toBe(
      404,
    )
    expect((await call(`/me/water/${waterId}`, { method: 'DELETE', cookie: member })).status).toBe(
      404,
    )
    expect((await call<Json>(`/me/water?date=${today}`, { cookie: member })).data.water.ml).toBe(0)
    // Ids of another person, wherever they appear, answer as if they don't exist.
    for (const path of [
      `/admin/users/${otherId}`,
      `/admin/users/${otherId}/food`,
      `/admin/users/${otherId}/check-ins`,
      '/sessions/999999',
    ]) {
      const res = await call(path, { cookie: member })
      expect([403, 404], path).toContain(res.status)
    }
    // Their export holds only their own things.
    const file = await call<Json>('/me/export', { cookie: member })
    expect(JSON.stringify(file.data)).not.toContain('Secret salad')
    expect(JSON.stringify(file.data)).not.toContain(OTHER_CLIENT.email)
  })
})
