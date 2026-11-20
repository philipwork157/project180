// Faster food logging: "Describe" (Claude from words), and favourite foods. Each checks nobody
// reaches anyone else's.
import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeMeter } from '../src/claude-calls'
import { estimateFoodText } from '../src/food-photo'
import { call, setupHousehold } from './helpers'

type Json = Record<string, any>

afterEach(() => vi.restoreAllMocks())

const EGGS = {
  name: 'Scrambled eggs',
  grams: 120,
  kcal: 180,
  proteinG: 13,
  carbsG: 1,
  fatG: 13,
  fibreG: 0,
  sugarG: 1,
  sodiumMg: 340,
}

describe('describe what you ate', () => {
  it('without a Claude key it answers 503 and never calls out', async () => {
    const { member } = await setupHousehold()
    const spy = vi.spyOn(globalThis, 'fetch')
    const res = await call('/me/food/describe', {
      method: 'POST',
      cookie: member,
      body: { text: '2 eggs and toast' },
    })
    expect(res.status).toBe(503)
    expect(spy).not.toHaveBeenCalled()
  })

  it('sends only the words to Claude and turns the answer into foods (no label)', async () => {
    const answer = {
      kind: 'meal',
      items: [
        {
          name: 'Scrambled eggs',
          grams: 120,
          kcal: 180,
          protein_g: 13,
          carbs_g: 1,
          fat_g: 13,
          fibre_g: 0,
          sugar_g: 1,
          sodium_mg: 340,
          confidence: 'medium',
        },
      ],
      label: null,
      note: null,
    }
    const calls: RequestInit[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      calls.push(init ?? {})
      return Response.json({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(answer) }],
      })
    })
    const meter: ClaudeMeter = { model: 'claude-sonnet-5-5' }
    const draft = await estimateFoodText(
      { ...env, ANTHROPIC_API_KEY: 'test-key' },
      '2 scrambled eggs',
      meter,
    )
    expect(draft.label).toBeNull()
    expect(draft.items[0]).toMatchObject({ name: 'Scrambled eggs', kcal: 180, sodiumMg: 340 })
    const body = JSON.parse(String(calls[0]?.body))
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'What the person ate: 2 scrambled eggs' },
    ])
    // Saved apart from photos in the Claude costs.
    expect(meter).toMatchObject({ outcome: 'ok', kind: 'words' })
  })

  it('refuses an empty description', async () => {
    const { member } = await setupHousehold()
    const res = await call('/me/food/describe', {
      method: 'POST',
      cookie: member,
      body: { text: ' ' },
    })
    expect(res.status).toBe(400)
  })
})

describe('favourite foods', () => {
  it('stars, updates by name, lists newest first and unstars only your own', async () => {
    const { admin, member } = await setupHousehold()
    const first = await call<Json>('/me/food/favourites', {
      method: 'POST',
      cookie: member,
      body: EGGS,
    })
    expect(first.status).toBe(201)
    await call('/me/food/favourites', {
      method: 'POST',
      cookie: member,
      body: { name: 'Banana', grams: 118, kcal: 105, proteinG: 1.3 },
    })
    // The same name again updates it instead of adding a second.
    const again = await call<Json>('/me/food/favourites', {
      method: 'POST',
      cookie: member,
      body: { ...EGGS, kcal: 200 },
    })
    expect(again.status).toBe(200)
    const list = again.data.favourites
    expect(list.map((f: Json) => [f.name, f.kcal])).toEqual([
      ['Banana', 105],
      ['Scrambled eggs', 200],
    ])

    // Someone else sees none of them and can't remove them.
    expect((await call<Json>('/me/food/favourites', { cookie: admin })).data.favourites).toEqual([])
    const id = list[0].id
    expect(
      (await call(`/me/food/favourites/${id}`, { method: 'DELETE', cookie: admin })).status,
    ).toBe(404)
    const removed = await call<Json>(`/me/food/favourites/${id}`, {
      method: 'DELETE',
      cookie: member,
    })
    expect(removed.data.favourites.map((f: Json) => f.name)).toEqual(['Scrambled eggs'])
    expect((await call('/me/food/favourites')).status).toBe(401)
  })
})
