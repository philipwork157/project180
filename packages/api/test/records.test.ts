// Invitations, the record of who did what, errors, first steps for coaches, the business name
// in the app and "download my data". Each checks nobody sees anyone else's.
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, MEMBER, setupHousehold, signIn, signInPlatform } from './helpers'

type Json = Record<string, any>

const SOLO = { name: 'Sam Solo', email: 'sam@example.com', password: 'solo-password-1' }
const OTHER = { name: 'Olga', email: 'olga@other.example', password: 'other-password-1' }
const NEW = { name: 'Nina New', email: 'nina@example.com' }

const tokenOf = (link: string) => new URL(link).searchParams.get('token') as string

/** Someone who signed up in the app and confirmed their email: training on their own. */
async function soloUser() {
  const res = await call<Json>('/account/signup', {
    method: 'POST',
    body: { ...SOLO, acceptTerms: true },
  })
  await call('/account/verify', { method: 'POST', body: { token: tokenOf(res.data.link) } })
  return signIn(SOLO.email, SOLO.password)
}

const invite = (cookie: string, body: Json) =>
  call<Json>('/admin/invitations', { method: 'POST', cookie, body })

describe('invitations', () => {
  it('someone new accepts from the link and joins the coach’s business', async () => {
    await createAdmin()
    const coach = await signIn(ADMIN.email, ADMIN.password)
    const sent = await invite(coach, NEW)
    expect(sent.status).toBe(201)
    expect(sent.data.invitations).toEqual([
      expect.objectContaining({ email: NEW.email, name: NEW.name, status: 'pending' }),
    ])
    const token = tokenOf(sent.data.link)
    const look = await call<Json>('/account/invite/look', { method: 'POST', body: { token } })
    expect(look.data.invitation).toMatchObject({ email: NEW.email, existing: false })

    const refused = await call('/account/invite/accept', {
      method: 'POST',
      body: { token, name: 'Nina', password: 'nina-password-1' },
    })
    expect(refused.status).toBe(400) // the terms tick is required
    const accepted = await call<Json>('/account/invite/accept', {
      method: 'POST',
      body: { token, name: 'Nina', password: 'nina-password-1', acceptTerms: true },
    })
    expect(accepted.status).toBe(201)
    // Signed in straight away (the link proved the email), with a coach and no welcome wizard.
    const nina = await signIn(NEW.email, 'nina-password-1')
    const me = (await call<Json>('/me', { cookie: nina })).data.user
    expect(me).toMatchObject({ coachName: ADMIN.name, needsOnboarding: false })
    expect(me.coachId).toBeGreaterThan(0)
    // The link works once.
    expect((await call('/account/invite/look', { method: 'POST', body: { token } })).status).toBe(
      400,
    )
    const clients = await call<Json>('/admin/users', { cookie: coach })
    expect(JSON.stringify(clients.data)).toContain(NEW.email)
  })

  it('someone on their own accepts in the app and keeps what they logged', async () => {
    await createAdmin()
    const coach = await signIn(ADMIN.email, ADMIN.password)
    const solo = await soloUser()
    await call('/me/water', {
      method: 'POST',
      cookie: solo,
      body: { clientUuid: crypto.randomUUID(), date: '2026-11-14', ml: 500 },
    })
    const sent = await invite(coach, { name: SOLO.name, email: SOLO.email })
    const look = await call<Json>('/account/invite/look', {
      method: 'POST',
      body: { token: tokenOf(sent.data.link) },
    })
    expect(look.data.invitation.existing).toBe(true)
    // They can't make a second account from the link.
    const twice = await call('/account/invite/accept', {
      method: 'POST',
      body: { token: tokenOf(sent.data.link), name: 'x', password: 'xxxxxxxx1', acceptTerms: true },
    })
    expect(twice.status).toBe(409)

    const mine = await call<Json>('/me/invitations', { cookie: solo })
    expect(mine.data.invitations).toEqual([
      expect.objectContaining({ coachName: ADMIN.name, businessName: 'Project 180' }),
    ])
    const id = mine.data.invitations[0].id
    expect(
      (await call(`/me/invitations/${id}/accept`, { method: 'POST', cookie: solo })).status,
    ).toBe(200)
    const me = (await call<Json>('/me', { cookie: solo })).data.user
    expect(me.coachName).toBe(ADMIN.name)
    const water = await call<Json>('/me/water?date=2026-11-14', { cookie: solo })
    expect(water.data.water.ml).toBe(500)
    // With a coach now: no more invitations, and the coach sets their targets.
    expect((await call<Json>('/me/invitations', { cookie: solo })).data.invitations).toEqual([])
    const targets = await call('/me/nutrition-targets', {
      method: 'PUT',
      cookie: solo,
      body: { kcal: 2000, proteinG: 120 },
    })
    expect(targets.status).toBe(403)
  })

  it('never invites someone who already has a coach, and keeps businesses apart', async () => {
    const { admin } = await setupHousehold()
    await createAdmin(OTHER, 'owner', 'Other Gym')
    const other = await signIn(OTHER.email, OTHER.password)
    // Another business's client: refused, without saying whose.
    const taken = await invite(other, { name: 'Wife', email: MEMBER.email })
    expect(taken.status).toBe(409)
    // Your own client.
    expect((await invite(admin, { name: 'Wife', email: MEMBER.email })).status).toBe(409)

    const sent = await invite(admin, NEW)
    const id = sent.data.invitations[0].id
    // The other business sees none of it and can't cancel or resend it.
    expect((await call<Json>('/admin/invitations', { cookie: other })).data.invitations).toEqual([])
    expect(
      (await call(`/admin/invitations/${id}`, { method: 'DELETE', cookie: other })).status,
    ).toBe(404)
    expect(
      (await call(`/admin/invitations/${id}/resend`, { method: 'POST', cookie: other })).status,
    ).toBe(404)
    // Clients can't use the staff routes.
    const member = await signIn(MEMBER.email, MEMBER.password)
    expect((await call('/admin/invitations', { cookie: member })).status).toBe(403)
    // A client with a coach never sees invitations, even to their email.
    await invite(other, { name: 'Wife', email: MEMBER.email })
    expect((await call<Json>('/me/invitations', { cookie: member })).data.invitations).toEqual([])
    // Cancelling stops the link.
    const cancelled = await call<Json>(`/admin/invitations/${id}`, {
      method: 'DELETE',
      cookie: admin,
    })
    expect(cancelled.data.invitations).toEqual([])
    expect(
      (
        await call('/account/invite/look', {
          method: 'POST',
          body: { token: tokenOf(sent.data.link) },
        })
      ).status,
    ).toBe(400)
  })

  it('declining keeps them on their own', async () => {
    await createAdmin()
    const coach = await signIn(ADMIN.email, ADMIN.password)
    const solo = await soloUser()
    await invite(coach, { name: SOLO.name, email: SOLO.email })
    const id = (await call<Json>('/me/invitations', { cookie: solo })).data.invitations[0].id
    const declined = await call<Json>(`/me/invitations/${id}/decline`, {
      method: 'POST',
      cookie: solo,
    })
    expect(declined.data.invitations).toEqual([])
    expect((await call<Json>('/me', { cookie: solo })).data.user.coachId).toBe(null)
  })
})

describe('the record and errors (platform admin only)', () => {
  it('records account changes with names only, and only the platform admin reads it', async () => {
    const { admin } = await setupHousehold()
    await invite(admin, NEW)
    const platform = await signInPlatform()
    const audit = await call<Json>('/platform/audit', { cookie: platform, asAdminApp: true })
    const actions = audit.data.audit.events.map((e: Json) => e.action)
    expect(actions).toEqual(expect.arrayContaining(['user.created', 'invite.sent']))
    expect(JSON.stringify(audit.data)).not.toContain('@')
    expect((await call('/platform/audit', { cookie: admin })).status).toBe(404)

    const errors = await call<Json>('/platform/errors', { cookie: platform, asAdminApp: true })
    expect(errors.data.errors).toMatchObject({ last24h: 0, lastHour: 0, recent: [] })
    expect((await call('/platform/errors', { cookie: admin })).status).toBe(404)
  })

  it('saves errors and prunes them after 30 days', async () => {
    const { recordError, dailyCleanup } = await import('../src/index')
    await recordError(env, 'cron', 'daily cleanup', 'boom')
    const platform = await signInPlatform()
    const errors = await call<Json>('/platform/errors', { cookie: platform, asAdminApp: true })
    expect(errors.data.errors.recent).toEqual([
      expect.objectContaining({ source: 'cron', where: 'daily cleanup', message: 'boom' }),
    ])
    const { createDb } = await import('@project180/db')
    await dailyCleanup(createDb(env.DB), Date.now() + 31 * 24 * 60 * 60 * 1000)
    const after = await call<Json>('/platform/errors', { cookie: platform, asAdminApp: true })
    expect(after.data.errors.recent).toEqual([])
  })
})

describe('first steps, business name and my data', () => {
  it('ticks a new coach’s first steps from what they did', async () => {
    await createAdmin()
    const coach = await signIn(ADMIN.email, ADMIN.password)
    const before = await call<Json>('/admin/overview/first-steps', { cookie: coach })
    expect(before.data.steps).toEqual({
      client: false,
      program: false,
      assigned: false,
      message: false,
    })
    await invite(coach, NEW)
    const after = await call<Json>('/admin/overview/first-steps', { cookie: coach })
    expect(after.data.steps.client).toBe(true)
  })

  it('shows the business and coach by name, and exports only your own data', async () => {
    const { admin, member } = await setupHousehold()
    const me = (await call<Json>('/me', { cookie: member })).data.user
    expect(me).toMatchObject({ businessName: 'Project 180', coachName: ADMIN.name })
    await call('/me/water', {
      method: 'POST',
      cookie: member,
      body: { clientUuid: crypto.randomUUID(), date: '2026-11-14', ml: 250 },
    })
    await call('/me/water', {
      method: 'POST',
      cookie: admin,
      body: { clientUuid: crypto.randomUUID(), date: '2026-11-14', ml: 750 },
    })
    const file = await call<Json>('/me/export', { cookie: member })
    expect(file.status).toBe(200)
    expect(file.headers.get('content-disposition')).toContain('attachment')
    expect(file.data.account.email).toBe(MEMBER.email)
    expect(file.data.water).toEqual([expect.objectContaining({ ml: 250 })])
    expect(JSON.stringify(file.data)).not.toContain(ADMIN.email)
    expect((await call('/me/export')).status).toBe(401)
  })
})
