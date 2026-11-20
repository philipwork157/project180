// The platform admin (the developer): sees the Platform page (Claude switches, models, limits,
// costs, coaches, site health) and nothing of the gym's people or their data.
import { env } from 'cloudflare:test'
import { createDb } from '@project180/db'
import { describe, expect, it } from 'vitest'
import { assertWithinClaudeLimit, claudeCallsToday, recordClaudeCall } from '../src/claude-calls'
import { claudeFeature } from '../src/settings'
import { ADMIN, call, createAdmin, MEMBER, PLATFORM, signIn, signInPlatform } from './helpers'

type Json = Record<string, any>

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }

/** An owner with one client, a coach, and the platform admin. */
async function setup() {
  await createAdmin()
  const owner = await signIn(ADMIN.email, ADMIN.password)
  const client = await call<Json>('/admin/users', { method: 'POST', cookie: owner, body: MEMBER })
  await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
  const member = await signIn(MEMBER.email, MEMBER.password)
  const coach = await signIn(COACH.email, COACH.password)
  const platform = await signInPlatform()
  const platformId = (
    await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(PLATFORM.email).first<{
      id: number
    }>()
  )?.id as number
  return { owner, member, coach, platform, platformId, clientId: client.data.user.id as number }
}

const asPlatform = (path: string, cookie: string, opts: { method?: string; body?: unknown } = {}) =>
  call<Json>(path, { ...opts, cookie, asAdminApp: true })

describe('platform admin access', () => {
  it('signs in to the dashboard only, never the phone app', async () => {
    await createAdmin(PLATFORM, 'platform')
    const app = await call<Json>('/auth/sign-in/email', {
      method: 'POST',
      body: { email: PLATFORM.email, password: PLATFORM.password },
    })
    // Answered exactly like a wrong password (never "this is an admin account"), with no session.
    const wrong = await call<Json>('/auth/sign-in/email', {
      method: 'POST',
      body: { email: PLATFORM.email, password: 'not-the-password-1' },
    })
    expect(app.status).toBe(401)
    expect(app.status).toBe(wrong.status)
    expect(app.data).toEqual({ code: wrong.data.code, message: wrong.data.message })
    expect(app.headers.get('set-cookie') ?? '').not.toContain('session_token=')
    const dashboard = await signInPlatform()
    const me = await asPlatform('/me', dashboard)
    expect(me.data.user.role).toBe('platform')
  })

  it('sees the Platform page and none of the gym’s people or their data', async () => {
    const { platform, clientId } = await setup()
    for (const path of [
      '/platform/claude',
      '/platform/costs',
      '/platform/coaches',
      '/platform/health',
    ])
      expect((await asPlatform(path, platform)).status).toBe(200)
    for (const path of [
      '/admin/users',
      '/admin/users/directory',
      `/admin/users/${clientId}`,
      `/admin/users/${clientId}/food`,
      `/admin/users/${clientId}/activity`,
      '/admin/overview',
      '/admin/chat',
      '/exercises',
      '/workouts',
      '/programs',
    ])
      expect((await asPlatform(path, platform)).status, path).toBe(403)
  })

  it('is invisible to owners: not in their lists, and they can’t open, block or delete them', async () => {
    const { owner, platformId } = await setup()
    const people = await call<Json>('/admin/users', { cookie: owner })
    expect(people.data.users.map((u: Json) => u.email)).not.toContain(PLATFORM.email)
    const team = await call<Json>('/admin/users/directory?view=team', { cookie: owner })
    expect(team.data.people.map((u: Json) => u.email)).not.toContain(PLATFORM.email)
    expect((await call(`/admin/users/${platformId}/activity`, { cookie: owner })).status).toBe(404)
    const block = await call(`/admin/users/${platformId}/access`, {
      method: 'POST',
      cookie: owner,
      body: { blocked: true },
    })
    expect(block.status).toBe(404)
    expect(
      (await call(`/admin/users/${platformId}`, { method: 'DELETE', cookie: owner })).status,
    ).toBe(404)
  })

  it('keeps everyone else out of the Platform page', async () => {
    const { owner, coach, member } = await setup()
    for (const cookie of [owner, coach, member])
      for (const path of [
        '/platform/claude',
        '/platform/costs',
        '/platform/coaches',
        '/admin/email',
      ])
        expect((await call(path, { cookie })).status, path).toBe(404)
  })
})

describe('platform admin controls Claude', () => {
  it('switches features, picks models and sets hard limits, checked on the way in', async () => {
    const { platform } = await setup()
    const db = createDb(env.DB)
    const put = (body: Json) => asPlatform('/platform/claude', platform, { method: 'PUT', body })

    expect((await claudeFeature(db, env, 'food_photo')).model).toBe('claude-sonnet-5-5')
    const changed = await put({ feature: 'food_photo', model: 'claude-haiku-5-5', limitPerDay: 5 })
    expect(changed.status).toBe(200)
    const photo = changed.data.claude.features.find((f: Json) => f.feature === 'food_photo')
    expect(photo).toMatchObject({ model: 'claude-haiku-5-5', limitPerDay: 5, enabled: true })
    expect(await claudeFeature(db, env, 'food_photo')).toMatchObject({ model: 'claude-haiku-5-5' })

    expect((await put({ feature: 'food_photo', model: 'gpt-6' })).status).toBe(400)
    expect((await put({ feature: 'food_photo', limitPerDay: 501 })).status).toBe(400)
    expect((await put({ feature: 'nope', enabled: false })).status).toBe(400)

    // The hard limit is a ceiling for everyone, owners included.
    const setup_ = await call<Json>('/me/food/setup', {
      cookie: await signIn(ADMIN.email, ADMIN.password),
    })
    expect(setup_.data.photosPerDay).toBe(5)
  })

  it('saves every call with its cost, shows it on the page and counts it against the limit', async () => {
    const { platform, owner } = await setup()
    const db = createDb(env.DB)
    const ownerId = (await call<Json>('/me', { cookie: owner })).data.user.id as number
    await recordClaudeCall(db, ownerId, 'workout_builder', {
      model: 'claude-sonnet-5-5',
      outcome: 'ok',
      usage: { inputTokens: 1800, outputTokens: 600, cacheReadTokens: 0, cacheWriteTokens: 0 },
      durationMs: 4200,
    })
    await recordClaudeCall(db, ownerId, 'workout_builder', {
      model: 'claude-sonnet-5-5',
      failReason: 'Claude took longer than 90s',
    })
    expect(await claudeCallsToday(db, ownerId, 'workout_builder')).toBe(2)
    await expect(assertWithinClaudeLimit(db, ownerId, 'workout_builder', 2)).rejects.toMatchObject({
      status: 429,
    })
    await expect(
      assertWithinClaudeLimit(db, ownerId, 'workout_builder', 3),
    ).resolves.toBeUndefined()

    const costs = (await asPlatform('/platform/costs', platform)).data.costs
    expect(costs.month).toEqual([
      expect.objectContaining({
        feature: 'workout_builder',
        calls: 2,
        failed: 1,
        costMicros: 9600,
      }),
    ])
    expect(costs.failures[0]).toMatchObject({ reason: 'Claude took longer than 90s' })
    expect(costs.topUsers[0]).toMatchObject({ name: ADMIN.name, calls: 2, costMicros: 9600 })

    const coaches = (await asPlatform('/platform/coaches', platform)).data.coaches
    const pieter = coaches.find((c: Json) => c.email === ADMIN.email)
    expect(pieter).toMatchObject({
      role: 'owner',
      clients: 1,
      monthCalls: 2,
      monthCostMicros: 9600,
    })
    expect(coaches.map((c: Json) => c.email)).not.toContain(PLATFORM.email)
    expect(coaches.map((c: Json) => c.email)).not.toContain(MEMBER.email)
  })

  it('never saves the photo, the note or the prompt', async () => {
    const columns = (
      await env.DB.prepare('PRAGMA table_info(claude_calls)').all<{ name: string }>()
    ).results.map((c) => c.name)
    for (const banned of ['photo', 'note', 'hint', 'prompt', 'text', 'answer'])
      expect(columns).not.toContain(banned)
  })
})
