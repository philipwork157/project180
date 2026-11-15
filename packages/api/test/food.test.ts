import { env, SELF } from 'cloudflare:test'
import { createDb } from '@project180/db'
import { todayIn } from '@project180/shared'
import { HTTPException } from 'hono/http-exception'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimPhoto, estimateFoodPhoto, parseFoodPhotoReply, releasePhoto } from '../src/food-photo'
import { foodPhotosAvailable, photoLimitFor } from '../src/settings'
import { ADMIN, call, createAdmin, MEMBER, setupHousehold, signIn, signInAsIs } from './helpers'

type Json = Record<string, any>

afterEach(() => {
  vi.restoreAllMocks()
})

const DAY = '2026-11-14'
const food = (over: Json = {}) => ({
  clientUuid: crypto.randomUUID(),
  name: 'Chicken breast',
  grams: 150,
  kcal: 248,
  proteinG: 46.5,
  carbsG: 0,
  fatG: 5.4,
  ...over,
})

const addFood = (cookie: string, body: Json) =>
  call<Json>('/me/food', { method: 'POST', cookie, body: { date: DAY, meal: 'lunch', ...body } })

const COACH = { name: 'Coach Kim', email: 'kim@example.com', password: 'coach-password-1' }

describe('food log', () => {
  it('logs foods, shows the day with totals, edits and deletes', async () => {
    const { member } = await setupHousehold()
    const added = await addFood(member, {
      entries: [food(), food({ name: 'Rice', grams: 180, kcal: 234, proteinG: 4.3, carbsG: 51 })],
    })
    expect(added.status).toBe(201)
    expect(added.data.day.entries.map((e: Json) => e.name)).toEqual(['Chicken breast', 'Rice'])
    expect(added.data.day.totals).toEqual({ kcal: 482, proteinG: 50.8, carbsG: 51, fatG: 5.4 })

    const day = await call<Json>(`/me/food?date=${DAY}`, { cookie: member })
    expect(day.data.day.entries).toHaveLength(2)
    const rice = day.data.day.entries[1]
    expect(rice).toMatchObject({ meal: 'lunch', source: 'manual', grams: 180 })

    const edited = await call<Json>(`/me/food/${rice.id}`, {
      method: 'PATCH',
      cookie: member,
      body: { meal: 'dinner', grams: 90, kcal: 117 },
    })
    expect(edited.status).toBe(200)
    expect(edited.data.day.entries[1]).toMatchObject({ meal: 'dinner', grams: 90, kcal: 117 })

    const removed = await call<Json>(`/me/food/${rice.id}`, { method: 'DELETE', cookie: member })
    expect(removed.data.day.entries).toHaveLength(1)
    expect(removed.data.day.totals.kcal).toBe(248)
  })

  it('never saves a retry twice, and refuses an id someone else used', async () => {
    const { admin, member } = await setupHousehold()
    const one = food()
    await addFood(member, { entries: [one] })
    const again = await addFood(member, { entries: [one, food({ name: 'Apple', kcal: 80 })] })
    expect(again.status).toBe(201)
    expect(again.data.day.entries.map((e: Json) => e.name)).toEqual(['Chicken breast', 'Apple'])

    const stolen = await addFood(admin, { entries: [one] })
    expect(stolen.status).toBe(409)
  })

  it('refuses bad input', async () => {
    const { member } = await setupHousehold()
    expect((await addFood(member, { entries: [food({ kcal: -5 })] })).status).toBe(400)
    expect((await addFood(member, { meal: 'brunch', entries: [food()] })).status).toBe(400)
    expect((await call('/me/food?date=2026-13-01', { cookie: member })).status).toBe(400)
    expect(
      (await call('/me/food/summary?from=2026-01-01&to=2026-12-31', { cookie: member })).status,
    ).toBe(400)
  })

  it('adds up days in a range and lists recent foods once each', async () => {
    const { member } = await setupHousehold()
    const today = todayIn('Africa/Johannesburg')
    await call('/me/food', {
      method: 'POST',
      cookie: member,
      body: { date: today, meal: 'breakfast', entries: [food({ name: 'Oats', kcal: 300 })] },
    })
    await call('/me/food', {
      method: 'POST',
      cookie: member,
      body: { date: today, meal: 'lunch', entries: [food(), food({ name: 'oats ', kcal: 150 })] },
    })
    const summary = await call<Json>(`/me/food/summary?from=${today}&to=${today}`, {
      cookie: member,
    })
    expect(summary.data.summary.days).toEqual([
      expect.objectContaining({ date: today, entries: 3, kcal: 698 }),
    ])
    const recent = await call<Json>('/me/food/recent', { cookie: member })
    expect(recent.data.foods.map((f: Json) => f.name)).toEqual(['oats ', 'Chicken breast'])
  })
})

describe('food log privacy', () => {
  it('needs a sign-in and a chosen password', async () => {
    expect((await call('/me/food')).status).toBe(401)
    await setupHousehold()
    await env.DB.prepare('UPDATE users SET must_change_password = 1 WHERE email = ?')
      .bind(MEMBER.email)
      .run()
    const fresh = await signInAsIs(MEMBER.email, MEMBER.password)
    expect((await call('/me/food', { cookie: fresh })).status).toBe(403)
  })

  it('only ever shows and changes your own foods', async () => {
    const { admin, member } = await setupHousehold()
    const mine = await addFood(admin, { entries: [food({ name: 'Coach lunch' })] })
    const id = mine.data.day.entries[0].id
    expect(
      (await call(`/me/food/${id}`, { method: 'PATCH', cookie: member, body: { kcal: 1 } })).status,
    ).toBe(404)
    expect((await call(`/me/food/${id}`, { method: 'DELETE', cookie: member })).status).toBe(404)
    const theirs = await call<Json>(`/me/food?date=${DAY}`, { cookie: member })
    expect(theirs.data.day.entries).toEqual([])
  })

  it('lets only the staff who manage a client read their log and set targets', async () => {
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
    await addFood(client, { entries: [food()] })

    const seen = await call<Json>(`/admin/users/${clientId}/food?date=${DAY}`, { cookie: owner })
    expect(seen.data.day.entries).toHaveLength(1)
    expect(
      (await call(`/admin/users/${clientId}/food?date=${DAY}`, { cookie: coach })).status,
    ).toBe(404)
    const targets = { kcal: 2100, proteinG: 140 }
    expect(
      (
        await call(`/admin/users/${clientId}/nutrition-targets`, {
          method: 'PUT',
          cookie: coach,
          body: targets,
        })
      ).status,
    ).toBe(404)
    // A client can't reach the admin routes at all, not even for themselves.
    expect(
      (
        await call(`/admin/users/${clientId}/nutrition-targets`, {
          method: 'PUT',
          cookie: client,
          body: targets,
        })
      ).status,
    ).toBe(403)
  })
})

describe('nutrition targets', () => {
  it('the coach sets them, the client sees them with their day, and they can be cleared', async () => {
    const { admin, member } = await setupHousehold()
    const me = await call<Json>('/me', { cookie: member })
    const id = me.data.user.id
    const set = await call<Json>(`/admin/users/${id}/nutrition-targets`, {
      method: 'PUT',
      cookie: admin,
      body: { kcal: 2100, proteinG: 140, carbsG: 220 },
    })
    expect(set.status).toBe(200)
    expect(set.data.targets).toMatchObject({ kcal: 2100, proteinG: 140, carbsG: 220, fatG: null })
    await call(`/admin/users/${id}/nutrition-targets`, {
      method: 'PUT',
      cookie: admin,
      body: { kcal: 2000, proteinG: 150 },
    })
    const day = await call<Json>('/me/food', { cookie: member })
    expect(day.data.day.targets).toMatchObject({ kcal: 2000, proteinG: 150, carbsG: null })
    expect(
      (
        await call(`/admin/users/${id}/nutrition-targets`, {
          method: 'PUT',
          cookie: admin,
          body: { kcal: 100, proteinG: 150 },
        })
      ).status,
    ).toBe(400)
    await call(`/admin/users/${id}/nutrition-targets`, { method: 'DELETE', cookie: admin })
    expect((await call<Json>('/me/food', { cookie: member })).data.day.targets).toBeNull()
  })
})

describe('food photos', () => {
  it('without a Claude key the app is told photos are off, and the photo route never calls out', async () => {
    const { member } = await setupHousehold()
    const setup = await call<Json>('/me/food/setup', { cookie: member })
    expect(setup.data).toEqual({ photos: false, photosPerDay: 10, barcode: true, search: true })
    const spy = vi.spyOn(globalThis, 'fetch')
    const form = new FormData()
    form.set('photo', new File([new Uint8Array([1, 2, 3])], 'meal.jpg', { type: 'image/jpeg' }))
    const res = await SELF.fetch('http://localhost/api/me/food/photo', {
      method: 'POST',
      headers: { cookie: member, origin: 'http://localhost' },
      body: form,
    })
    expect(res.status).toBe(503)
    await res.text()
    expect(spy).not.toHaveBeenCalled()
  })

  it('reads a meal reply, clamps silly numbers and keeps only what we asked for', () => {
    const draft = parseFoodPhotoReply(
      JSON.stringify({
        kind: 'meal',
        items: [
          {
            name: 'Pap',
            grams: 250.44,
            kcal: 290.6,
            protein_g: 6.04,
            carbs_g: 63,
            fat_g: 1,
            confidence: 'medium',
          },
          {
            name: 'Boerewors',
            grams: 120,
            kcal: 99999,
            protein_g: -3,
            carbs_g: null,
            fat_g: 30,
            confidence: 'sure',
          },
        ],
        label: null,
        note: 'Oil is hard to see.',
      }),
    )
    expect(draft).toEqual({
      kind: 'meal',
      items: [
        {
          name: 'Pap',
          grams: 250.4,
          kcal: 291,
          proteinG: 6,
          carbsG: 63,
          fatG: 1,
          confidence: 'medium',
        },
        {
          name: 'Boerewors',
          grams: 120,
          kcal: 5000,
          proteinG: 0,
          carbsG: null,
          fatG: 30,
          confidence: 'low',
        },
      ],
      label: null,
      note: 'Oil is hard to see.',
    })
  })

  it('reads a label, drops items for "not food", and refuses anything else', () => {
    const label = parseFoodPhotoReply(
      JSON.stringify({
        kind: 'label',
        items: [
          {
            name: 'Muesli',
            grams: 45,
            kcal: 171,
            protein_g: 5.6,
            carbs_g: 28.8,
            fat_g: 3.2,
            confidence: 'high',
          },
        ],
        label: { per_100g: { kcal: 380, protein_g: 12.5, carbs_g: 64, fat_g: 7.2 }, serving_g: 45 },
        note: null,
      }),
    )
    expect(label?.label).toEqual({
      per100g: { kcal: 380, proteinG: 12.5, carbsG: 64, fatG: 7.2 },
      servingG: 45,
    })
    const shoe = parseFoodPhotoReply(
      JSON.stringify({
        kind: 'not_food',
        items: [
          {
            name: 'Shoe',
            grams: null,
            kcal: 1,
            protein_g: 0,
            carbs_g: null,
            fat_g: null,
            confidence: 'low',
          },
        ],
        label: null,
        note: null,
      }),
    )
    expect(shoe?.items).toEqual([])
    expect(parseFoodPhotoReply('not json')).toBeNull()
    expect(parseFoodPhotoReply(JSON.stringify({ kind: 'meal' }))).toBeNull()
  })

  it('sends the photo to Claude and turns the answer into a draft', async () => {
    const answer = {
      kind: 'meal',
      items: [
        {
          name: 'Biltong',
          grams: 50,
          kcal: 140,
          protein_g: 27,
          carbs_g: 1,
          fat_g: 3,
          confidence: 'high',
        },
      ],
      label: null,
      note: null,
    }
    const calls: { url: string; init: RequestInit }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return Response.json({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(answer) }],
      })
    })
    const draft = await estimateFoodPhoto(
      { ...env, ANTHROPIC_API_KEY: 'test-key' },
      { bytes: new Uint8Array([255, 216, 255]), type: 'image/jpeg' },
      '50 g packet',
    )
    expect(draft.items).toEqual([
      {
        name: 'Biltong',
        grams: 50,
        kcal: 140,
        proteinG: 27,
        carbsG: 1,
        fatG: 3,
        confidence: 'high',
      },
    ])
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages')
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('x-api-key')).toBe('test-key')
    expect(headers.get('anthropic-version')).toBe('2023-06-01')
    const body = JSON.parse(String(calls[0]?.init.body))
    expect(body.model).toBe('claude-sonnet-5-5')
    expect(body.output_config.format.type).toBe('json_schema')
    expect(body.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/' },
    })
    expect(body.messages[0].content[1].text).toContain('50 g packet')
  })

  it('answers a friendly error when Claude fails or replies in the wrong shape', async () => {
    const photo = { bytes: new Uint8Array([1]), type: 'image/jpeg' }
    const keyed = { ...env, ANTHROPIC_API_KEY: 'test-key' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({ error: { type: 'overloaded_error' } }, { status: 529 }),
    )
    await expect(estimateFoodPhoto(keyed, photo, '')).rejects.toMatchObject({ status: 502 })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'A plate of food' }],
      }),
    )
    await expect(estimateFoodPhoto(keyed, photo, '')).rejects.toBeInstanceOf(HTTPException)
    await expect(estimateFoodPhoto(env, photo, '')).rejects.toMatchObject({ status: 503 })
  })

  it('caps photos per day, and gives one back when Claude could not read it', async () => {
    const { member } = await setupHousehold()
    const me = await call<Json>('/me', { cookie: member })
    const db = createDb(env.DB)
    const id = me.data.user.id
    expect(await claimPhoto(db, id, DAY, 2)).toBe(1)
    expect(await claimPhoto(db, id, DAY, 2)).toBe(0)
    await expect(claimPhoto(db, id, DAY, 2)).rejects.toMatchObject({ status: 429 })
    await releasePhoto(db, id, DAY)
    expect(await claimPhoto(db, id, DAY, 2)).toBe(0)
    // A new day starts again.
    expect(await claimPhoto(db, id, '2026-11-15', 2)).toBe(1)
  })
})

describe('food photo switch', () => {
  it('is on by default; only an owner can turn it off, and then photos are unavailable', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
    const coach = await signIn(COACH.email, COACH.password)
    const keyed = { ...env, ANTHROPIC_API_KEY: 'test-key' }
    const db = createDb(env.DB)

    const before = await call<Json>('/admin/settings/food-photos', { cookie: coach })
    expect(before.data.foodPhotos).toMatchObject({ enabled: true, configured: false })
    expect(await foodPhotosAvailable(db, keyed)).toBe(true)
    // Without a key there are no photos, whatever the switch says.
    expect(await foodPhotosAvailable(db, env)).toBe(false)

    const byCoach = await call('/admin/settings/food-photos', {
      method: 'PUT',
      cookie: coach,
      body: { enabled: false },
    })
    expect(byCoach.status).toBe(403)

    const off = await call<Json>('/admin/settings/food-photos', {
      method: 'PUT',
      cookie: owner,
      body: { enabled: false },
    })
    expect(off.data.foodPhotos.enabled).toBe(false)
    expect(await foodPhotosAvailable(db, keyed)).toBe(false)

    await call('/admin/settings/food-photos', {
      method: 'PUT',
      cookie: owner,
      body: { enabled: true },
    })
    expect(await foodPhotosAvailable(db, keyed)).toBe(true)
  })

  it('is not for clients', async () => {
    const { member } = await setupHousehold()
    expect((await call('/admin/settings/food-photos', { cookie: member })).status).toBe(403)
  })
})

describe('food photo limits', () => {
  it('clients get the default, an owner changes it, a coach sets one client, owners have their own', async () => {
    await createAdmin()
    const owner = await signIn(ADMIN.email, ADMIN.password)
    await call('/admin/users', { method: 'POST', cookie: owner, body: { ...COACH, role: 'admin' } })
    const created = await call<Json>('/admin/users', {
      method: 'POST',
      cookie: owner,
      body: MEMBER,
    })
    const clientId = created.data.user.id as number
    const client = await signIn(MEMBER.email, MEMBER.password)
    const coach = await signIn(COACH.email, COACH.password)
    const db = createDb(env.DB)
    const perDayOf = async (cookie: string) =>
      (await call<Json>('/me/food/setup', { cookie })).data.photosPerDay

    // The default is 10 for clients; owners have the safety-net number instead.
    expect(await perDayOf(client)).toBe(10)
    expect(await perDayOf(owner)).toBe(100)

    // Only an owner changes the default, within 0 to 50.
    const put = (cookie: string, body: Json) =>
      call<Json>('/admin/settings/food-photos', { method: 'PUT', cookie, body })
    expect((await put(coach, { perDay: 3 })).status).toBe(403)
    expect((await put(owner, { perDay: 51 })).status).toBe(400)
    expect((await put(owner, {})).status).toBe(400)
    const changed = await put(owner, { perDay: 5 })
    expect(changed.data.foodPhotos).toMatchObject({ perDay: 5, enabled: true })
    expect(await perDayOf(client)).toBe(5)

    // The client's coach (here the owner) sets their own number, 0 switches photos off for them.
    const limitPath = `/admin/users/${clientId}/food/photo-limit`
    const set = (cookie: string, perDay: number | null) =>
      call<Json>(limitPath, { method: 'PUT', cookie, body: { perDay } })
    const two = await set(owner, 2)
    expect(two.data.photoLimit).toEqual({ perDay: 2, defaultPerDay: 5, effective: 2, usedToday: 0 })
    expect(await perDayOf(client)).toBe(2)
    await set(owner, 0)
    expect(await photoLimitFor(db, env, { id: clientId, role: 'member' })).toBe(0)
    expect((await call<Json>('/me/food/setup', { cookie: client })).data.photos).toBe(false)
    await set(owner, null)
    expect(await perDayOf(client)).toBe(5)

    // Nobody else changes it: another coach gets 404, the client can't reach admin routes.
    expect((await set(coach, 40)).status).toBe(404)
    expect((await call(limitPath, { cookie: coach })).status).toBe(404)
    expect((await set(client, 40)).status).toBe(403)
    expect((await set(owner, 51)).status).toBe(400)
  })
})
