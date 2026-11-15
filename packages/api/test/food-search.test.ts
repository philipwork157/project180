import { env } from 'cloudflare:test'
import { createDb } from '@project180/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchFoods, searchProviders } from '../src/barcode/search'
import { call, setupHousehold } from './helpers'

type Json = Record<string, any>

afterEach(() => {
  vi.restoreAllMocks()
})

const eggs = {
  code: '6009801234567',
  product_name: { en: 'Large Free Range Eggs', main: 'Large Free Range Eggs' },
  brands: ['Nulaid'],
  serving_quantity: '50',
  nutriments: {
    'energy-kcal_100g': 143,
    proteins_100g: 12.6,
    carbohydrates_100g: 0.7,
    fat_100g: 9.5,
  },
}
const eggplant = {
  code: '6001000000123',
  product_name: 'Eggplant dip',
  brands: 'Deli, Other',
  nutriments: { energy_100g: 836.8, proteins_100g: 2 },
}
const noNutrition = { code: '6001000000999', product_name: 'Egg cups', nutriments: {} }

const usdaEgg = {
  fdcId: 748967,
  dataType: 'Foundation',
  description: 'Eggs, Grade A, Large, egg whole',
  foodNutrients: [
    { nutrientId: 2047, value: 148 },
    { nutrientId: 1003, value: 12.4 },
    { nutrientId: 1005, value: 0.96 },
    { nutrientId: 1004, value: 9.96 },
  ],
}
const usdaBranded = {
  fdcId: 2000001,
  dataType: 'Branded',
  description: 'EGG SALAD',
  brandOwner: 'Deli Co',
  gtinUpc: '012345678905',
  foodNutrients: [
    { nutrientId: 1008, value: 210 },
    { nutrientId: 1003, value: 8 },
  ],
}

describe('food search providers', () => {
  it('searches with the barcode providers that can search, in their order', () => {
    expect(searchProviders(env).map((p) => p.id)).toEqual(['openfoodfacts'])
    const both = { ...env, FOOD_BARCODE_PROVIDERS: 'usda,openfoodfacts', USDA_API_KEY: 'k' }
    expect(searchProviders(both).map((p) => p.id)).toEqual(['usda', 'openfoodfacts'])
  })

  it('reads Search-a-licious hits, ranks them, skips ones without nutrition, and saves the search', async () => {
    const db = createDb(env.DB)
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => Response.json({ hits: [eggplant, noNutrition, eggs] }))
    const results = await searchFoods(db, env, '  Eggs ')
    expect(results).toEqual([
      {
        id: `openfoodfacts:${eggs.code}`,
        barcode: eggs.code,
        name: 'Large Free Range Eggs',
        brand: 'Nulaid',
        per100g: { kcal: 143, proteinG: 12.6, carbsG: 0.7, fatG: 9.5 },
        servingG: 50,
        source: {
          provider: 'openfoodfacts',
          label: 'Open Food Facts',
          url: `https://world.openfoodfacts.org/product/${eggs.code}`,
        },
      },
      expect.objectContaining({
        name: 'Eggplant dip',
        brand: 'Deli',
        per100g: expect.objectContaining({ kcal: 200 }),
      }),
    ])
    const [url, init] = spy.mock.calls[0] ?? []
    const asked = new URL(String(url))
    expect(asked.origin).toBe('https://search.openfoodfacts.org')
    expect(asked.searchParams.get('q')).toBe('eggs')
    expect(new Headers(init?.headers).get('user-agent')).toMatch(/^Project180\/1\.0 \(.+\)$/)

    // The same search, typed differently, comes from the saved copy.
    spy.mockClear()
    expect((await searchFoods(db, env, 'EGGS'))[0]?.name).toBe('Large Free Range Eggs')
    expect(spy).not.toHaveBeenCalled()
    // A week later it asks again.
    spy.mockImplementation(async () => Response.json({ hits: [] }))
    expect(await searchFoods(db, env, 'eggs', Date.now() + 8 * 24 * 60 * 60 * 1000)).toEqual([])
    expect(spy).toHaveBeenCalledOnce()
  })

  it('falls back to the classic Open Food Facts search when Search-a-licious fails', async () => {
    const db = createDb(env.DB)
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ products: [eggs] }))
    expect((await searchFoods(db, env, 'egg'))[0]?.name).toBe('Large Free Range Eggs')
    expect(String(spy.mock.calls[1]?.[0])).toContain('/cgi/search.pl?search_terms=egg')
  })

  it('puts USDA’s plain foods first, keeps the other provider’s foods when one fails', async () => {
    const db = createDb(env.DB)
    const keyed = { ...env, FOOD_BARCODE_PROVIDERS: 'usda,openfoodfacts', USDA_API_KEY: 'k' }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('api.nal.usda.gov')) return Response.json({ foods: [usdaBranded, usdaEgg] })
      return new Response('down', { status: 503 })
    })
    const results = await searchFoods(db, keyed, 'egg')
    expect(results.map((r) => r.name)).toEqual(['Eggs, Grade A, Large, egg whole', 'EGG SALAD'])
    expect(results[0]).toMatchObject({
      id: 'usda:748967',
      barcode: null,
      per100g: { kcal: 148, proteinG: 12.4, carbsG: 1, fatG: 10 },
      source: { provider: 'usda', url: 'https://fdc.nal.usda.gov/food-details/748967/nutrients' },
    })
    expect(results[1]).toMatchObject({ barcode: '012345678905', brand: 'Deli Co' })
  })

  it('answers 502 when every provider fails, and saves nothing so the next try asks again', async () => {
    const db = createDb(env.DB)
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    await expect(searchFoods(db, env, 'egg')).rejects.toMatchObject({ status: 502 })
    spy.mockImplementation(async () => Response.json({ hits: [eggs] }))
    expect(await searchFoods(db, env, 'egg')).toHaveLength(1)
  })
})

describe('food search route', () => {
  it('needs a sign-in, checks what was typed, and answers the results', async () => {
    expect((await call('/me/food/search?q=egg')).status).toBe(401)
    const { member } = await setupHousehold()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ hits: [eggs] }))
    expect((await call('/me/food/search?q=e', { cookie: member })).status).toBe(400)
    expect((await call('/me/food/search', { cookie: member })).status).toBe(400)
    const found = await call<Json>('/me/food/search?q=egg', { cookie: member })
    expect(found.status).toBe(200)
    expect(found.data.results[0]).toMatchObject({ name: 'Large Free Range Eggs', brand: 'Nulaid' })
  })

  it('says when no provider can search here', async () => {
    const db = createDb(env.DB)
    await expect(
      searchFoods(db, { ...env, FOOD_BARCODE_PROVIDERS: 'usda' }, 'egg'),
    ).rejects.toMatchObject({ status: 503 })
  })
})
