import { env, SELF } from 'cloudflare:test'
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

describe('temporary passwords expire', () => {
  const DAY = 24 * 60 * 60 * 1000
  /** Pretends the client's password was set this many days ago. */
  const ageTempPassword = (days: number) =>
    env.DB.prepare(
      `UPDATE accounts SET updated_at = ? WHERE provider_id = 'credential'
       AND user_id = (SELECT id FROM users WHERE email = ?)`,
    )
      .bind(Date.now() - days * DAY, MEMBER.email)
      .run()

  it('still works within a week', async () => {
    await adminAndNewClient()
    await ageTempPassword(6)
    expect(await signInStatus(MEMBER.email, MEMBER.password)).toBe(200)
  })

  it('refuses an old temporary password and leaves no session behind', async () => {
    await adminAndNewClient()
    const earlier = await signInAsIs(MEMBER.email, MEMBER.password)
    await ageTempPassword(8)
    const res = await call<{ code: string; message: string }>('/auth/sign-in/email', {
      method: 'POST',
      body: { email: MEMBER.email, password: MEMBER.password },
    })
    expect(res.status).toBe(403)
    expect(res.data.code).toBe('TEMP_PASSWORD_EXPIRED')
    expect(res.data.message).toMatch(/Ask your coach/)
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/session_token=[^;]/)
    // Any device still on the old temporary password is signed out too.
    expect((await call('/me', { cookie: earlier })).status).toBe(401)
    const left = await env.DB.prepare(
      'SELECT count(*) AS n FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)',
    )
      .bind(MEMBER.email)
      .first<{ n: number }>()
    expect(left?.n).toBe(0)
  })

  it('a wrong password on an expired account is still just wrong', async () => {
    await adminAndNewClient()
    await ageTempPassword(30)
    expect(await signInStatus(MEMBER.email, 'not-the-password')).toBe(401)
  })

  it('a new temporary password from the coach starts a fresh week', async () => {
    const { admin, clientId } = await adminAndNewClient()
    await ageTempPassword(8)
    expect(await signInStatus(MEMBER.email, MEMBER.password)).toBe(403)
    const reset = await call(`/admin/users/${clientId}/password`, {
      method: 'POST',
      cookie: admin,
      body: { password: 'Cedar-Otter-Kayak-Lark-482' },
    })
    expect(reset.status).toBe(204)
    expect(await signInStatus(MEMBER.email, 'Cedar-Otter-Kayak-Lark-482')).toBe(200)
  })

  it('a password they chose themselves never expires', async () => {
    await adminAndNewClient()
    const cookie = await signInAsIs(MEMBER.email, MEMBER.password)
    await call('/me/first-password', {
      method: 'POST',
      cookie,
      body: { password: 'my-own-password' },
    })
    await ageTempPassword(400)
    expect(await signInStatus(MEMBER.email, 'my-own-password')).toBe(200)
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

describe('cross-site requests and security headers', () => {
  const post = (path: string, origin: string, cookie: string, contentType = 'text/plain') =>
    SELF.fetch(`http://localhost/api${path}`, {
      method: 'POST',
      headers: { origin, cookie, 'content-type': contentType },
      body: JSON.stringify({ seconds: 60 }),
    })

  it('refuses a form-style POST from another site, even with a signed-in cookie', async () => {
    const { member } = await setupHousehold()
    const evil = await post('/me/heartbeat', 'https://evil.example', member)
    expect(evil.status).toBe(403)
    await evil.text()
    const form = await post(
      '/me/heartbeat',
      'https://evil.example',
      member,
      'application/x-www-form-urlencoded',
    )
    expect(form.status).toBe(403)
    await form.text()
    // The same request from our own site works.
    const ours = await post('/me/heartbeat', 'http://localhost', member)
    expect(ours.status).toBe(204)
    await ours.text()
  })

  it('sends security headers on API answers', async () => {
    const res = await call('/health')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    // Photos are shown by the other app too, so they must not be locked to one origin.
    expect(res.headers.get('cross-origin-resource-policy')).toBeNull()
  })
})

describe('privacy: weigh-ins, stats, videos and plan days', () => {
  const OTHER = { name: 'Other Client', email: 'other@example.com', password: 'other-password-1' }
  type Json = Record<string, any>

  /** Owner, two clients, and a program (one workout, one exercise) for the first client. */
  async function twoClients() {
    const { admin, member } = await setupHousehold()
    await call('/admin/users', { method: 'POST', cookie: admin, body: OTHER })
    const other = await signIn(OTHER.email, OTHER.password)
    const ex = await call<Json>('/exercises', {
      method: 'POST',
      cookie: admin,
      body: { name: 'Squat', muscleGroup: 'legs' },
    })
    const exerciseId = ex.data.exercise.id as number
    const w = await call<Json>('/workouts', {
      method: 'POST',
      cookie: admin,
      body: {
        name: 'Legs',
        exercises: [
          { exerciseId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 10, restSeconds: 90 },
        ],
      },
    })
    const p = await call<Json>('/programs', {
      method: 'POST',
      cookie: admin,
      body: {
        name: 'Base',
        durationWeeks: 1,
        days: [{ weekNumber: 1, dayNumber: 1, workoutId: w.data.workout.id }],
      },
    })
    const me = await call<Json>('/me', { cookie: member })
    await call('/enrollments', {
      method: 'POST',
      cookie: admin,
      body: { userId: me.data.user.id, programId: p.data.program.id, startDate: '2026-11-09' },
    })
    return { admin, member, other, exerciseId }
  }

  it("weigh-ins stay your own: nobody sees or overwrites someone else's", async () => {
    const { member, other } = await twoClients()
    const uuid = crypto.randomUUID()
    const mine = await call('/me/checkins', {
      method: 'PUT',
      cookie: member,
      body: { clientUuid: uuid, date: '2026-11-10', weightKg: 80 },
    })
    expect(mine.status).toBe(200)
    // Reusing someone else's weigh-in id is refused (409, not a 500) and changes nothing.
    const stolen = await call('/me/checkins', {
      method: 'PUT',
      cookie: other,
      body: { clientUuid: uuid, date: '2026-11-10', weightKg: 120 },
    })
    expect(stolen.status).toBe(409)
    const theirs = await call<Json>('/me/stats', { cookie: other })
    expect(theirs.data.stats.bodyWeight).toEqual([])
    const stats = await call<Json>('/me/stats', { cookie: member })
    expect(stats.data.stats.bodyWeight).toEqual([{ date: '2026-11-10', weightKg: 80 }])
    // Your own id on another day is refused too.
    const otherDay = await call('/me/checkins', {
      method: 'PUT',
      cookie: member,
      body: { clientUuid: uuid, date: '2026-11-11', weightKg: 79 },
    })
    expect(otherDay.status).toBe(409)
  })

  it('refuses dates that do not exist', async () => {
    const { member } = await twoClients()
    const res = await call('/me/checkins', {
      method: 'PUT',
      cookie: member,
      body: { clientUuid: crypto.randomUUID(), date: '2026-02-30', weightKg: 80 },
    })
    expect(res.status).toBe(400)
  })

  it('stats only count your own workouts', async () => {
    const { member, other } = await twoClients()
    const plan = await call<Json>('/me/plan', { cookie: member })
    const day = plan.data.plan.days.find((d: Json) => d.workoutId !== null)
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie: member,
      body: { clientUuid: crypto.randomUUID(), workoutId: day.workoutId },
    })
    const id = s.data.session.id
    await call(`/sessions/${id}/finish`, { method: 'POST', cookie: member, body: {} })
    expect((await call<Json>('/me/stats', { cookie: member })).data.stats.workouts).toBe(1)
    expect((await call<Json>('/me/stats', { cookie: other })).data.stats.workouts).toBe(0)
  })

  it("a session can't be tied to someone else's program day", async () => {
    const { member, other } = await twoClients()
    const plan = await call<Json>('/me/plan', { cookie: member })
    const day = plan.data.plan.days.find((d: Json) => d.workoutId !== null)
    const res = await call('/sessions', {
      method: 'POST',
      cookie: other,
      body: {
        clientUuid: crypto.randomUUID(),
        workoutId: day.workoutId,
        programDayId: day.programDayId,
      },
    })
    expect(res.status).toBe(404)
  })

  it('clients can only look up videos for exercises in their own workouts', async () => {
    const { admin, member, other, exerciseId } = await twoClients()
    expect((await call(`/videos?exerciseId=${exerciseId}`, { cookie: admin })).status).toBe(200)
    expect((await call(`/videos?exerciseId=${exerciseId}`, { cookie: member })).status).toBe(200)
    expect((await call(`/videos?exerciseId=${exerciseId}`, { cookie: other })).status).toBe(404)
  })

  it("your time zone and weight unit can't be changed", async () => {
    const { member } = await twoClients()
    const res = await call<Json>('/me', {
      method: 'PATCH',
      cookie: member,
      body: { timezone: 'Europe/London', weightUnit: 'lb' },
    })
    expect(res.status).toBe(200)
    expect(res.data.user).toMatchObject({ timezone: 'Africa/Johannesburg', weightUnit: 'kg' })
  })
})
