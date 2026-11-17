// Quicker logging: copying a meal, saved meals, fibre/sugar/sodium, the logging streak and the
// evening reminder. Only ever your own.

import { env } from 'cloudflare:test'
import { createDb } from '@project180/db'
import { addDays, todayIn } from '@project180/shared'
import { describe, expect, it } from 'vitest'
import { sendFoodReminders } from '../src/food-reminders'
import { call, setupHousehold } from './helpers'

type Json = Record<string, any>

const today = () => todayIn('Africa/Johannesburg')

const log = (cookie: string, date: string, meal: string, foods: Json[]) =>
  call<Json>('/me/food', {
    method: 'POST',
    cookie,
    body: {
      date,
      meal,
      source: 'manual',
      entries: foods.map((f) => ({ clientUuid: crypto.randomUUID(), ...f })),
    },
  })

const oats = { name: 'Oats', grams: 60, kcal: 230, proteinG: 8, fibreG: 6, sugarG: 1, sodiumMg: 4 }
const egg = { name: 'Egg', kcal: 78, proteinG: 6.3 }

describe('nutrients', () => {
  it('keeps fibre, sugar and sodium and adds them up for the day', async () => {
    const { member } = await setupHousehold()
    const res = await log(member, today(), 'breakfast', [oats, egg])
    expect(res.status).toBe(201)
    expect(res.data.day.entries[0]).toMatchObject({ fibreG: 6, sugarG: 1, sodiumMg: 4 })
    expect(res.data.day.entries[1]).toMatchObject({ fibreG: null })
    expect(res.data.day.extras).toEqual({ fibreG: 6, sugarG: 1, sodiumMg: 4 })
  })
})

describe('copy a meal', () => {
  it('copies yesterday’s breakfast once, however often it’s retried', async () => {
    const { member } = await setupHousehold()
    const yesterday = addDays(today(), -1)
    await log(member, yesterday, 'breakfast', [oats, egg])
    const body = {
      clientUuid: crypto.randomUUID(),
      fromDate: yesterday,
      fromMeal: 'breakfast',
      date: today(),
      meal: 'breakfast',
    }
    const first = await call<Json>('/me/food/copy', { method: 'POST', cookie: member, body })
    expect(first.status).toBe(201)
    expect(first.data.day.entries.map((e: Json) => e.name)).toEqual(['Oats', 'Egg'])
    expect(first.data.day.entries[0].fibreG).toBe(6)
    const again = await call<Json>('/me/food/copy', { method: 'POST', cookie: member, body })
    expect(again.data.day.entries).toHaveLength(2)
  })

  it('404s when that meal is empty, or someone else’s', async () => {
    const { admin, member } = await setupHousehold()
    await log(member, today(), 'lunch', [egg])
    const body = {
      clientUuid: crypto.randomUUID(),
      fromDate: today(),
      fromMeal: 'lunch',
      date: today(),
      meal: 'dinner',
    }
    expect((await call('/me/food/copy', { method: 'POST', cookie: admin, body })).status).toBe(404)
  })
})

describe('saved meals', () => {
  it('saves a logged meal, lists it, logs it again and deletes it', async () => {
    const { member } = await setupHousehold()
    await log(member, today(), 'breakfast', [oats, egg])
    const saved = await call<Json>('/me/food/meals', {
      method: 'POST',
      cookie: member,
      body: { name: 'Usual breakfast', date: today(), meal: 'breakfast' },
    })
    expect(saved.status).toBe(201)
    expect(saved.data.meal).toMatchObject({ name: 'Usual breakfast', kcal: 308, proteinG: 14.3 })
    const list = (await call<Json>('/me/food/meals', { cookie: member })).data.meals
    expect(list).toHaveLength(1)

    const id = saved.data.meal.id
    const body = { clientUuid: crypto.randomUUID(), date: addDays(today(), -1), meal: 'breakfast' }
    const logged = await call<Json>(`/me/food/meals/${id}/log`, {
      method: 'POST',
      cookie: member,
      body,
    })
    expect(logged.data.day.entries).toHaveLength(2)
    await call(`/me/food/meals/${id}/log`, { method: 'POST', cookie: member, body })
    expect(
      (await call<Json>(`/me/food?date=${body.date}`, { cookie: member })).data.day.entries,
    ).toHaveLength(2)

    expect((await call(`/me/food/meals/${id}`, { method: 'DELETE', cookie: member })).status).toBe(
      204,
    )
    expect((await call<Json>('/me/food/meals', { cookie: member })).data.meals).toEqual([])
  })

  it('is only ever yours', async () => {
    const { admin, member } = await setupHousehold()
    await log(member, today(), 'breakfast', [oats])
    const saved = await call<Json>('/me/food/meals', {
      method: 'POST',
      cookie: member,
      body: { name: 'Mine', date: today(), meal: 'breakfast' },
    })
    const id = saved.data.meal.id
    expect((await call<Json>('/me/food/meals', { cookie: admin })).data.meals).toEqual([])
    expect((await call(`/me/food/meals/${id}`, { method: 'DELETE', cookie: admin })).status).toBe(
      404,
    )
    const body = { clientUuid: crypto.randomUUID(), date: today(), meal: 'lunch' }
    expect(
      (await call(`/me/food/meals/${id}/log`, { method: 'POST', cookie: admin, body })).status,
    ).toBe(404)
  })
})

describe('streak', () => {
  it('counts days in a row with food logged', async () => {
    const { member } = await setupHousehold()
    for (const back of [1, 2, 3]) await log(member, addDays(today(), -back), 'lunch', [egg])
    expect((await call<Json>('/me/food/streak', { cookie: member })).data.days).toBe(3)
    await log(member, today(), 'lunch', [egg])
    expect((await call<Json>('/me/food/streak', { cookie: member })).data.days).toBe(4)
  })
})

describe('evening reminder', () => {
  it('is off by default, can be turned on, and is due with fewer than two meals', async () => {
    const { member, admin } = await setupHousehold()
    expect((await call<Json>('/me/food/reminders', { cookie: member })).data.on).toBe(false)
    await call('/me/food/reminders', { method: 'PUT', cookie: member, body: { on: true } })
    await call('/me/food/reminders', { method: 'PUT', cookie: admin, body: { on: true } })
    expect((await call<Json>('/me/food/reminders', { cookie: member })).data.on).toBe(true)
    // The admin has logged two meals today, the member one.
    await log(admin, today(), 'breakfast', [egg])
    await log(admin, today(), 'lunch', [egg])
    await log(member, today(), 'breakfast', [egg])
    const result = await sendFoodReminders(env, createDb(env.DB))
    expect(result.due).toBe(1)
  })
})
