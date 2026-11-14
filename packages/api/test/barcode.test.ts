import { env } from 'cloudflare:test'
import { createDb } from '@project180/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { barcodeProviders, lookupBarcode } from '../src/barcode'
import { call, setupHousehold } from './helpers'

type Json = Record<string, any>

afterEach(() => {
  vi.restoreAllMocks()
})

const CODE = '6001007000000'

const off = (product: Json | null) =>
  Response.json(product ? { status: 1, product } : { status: 0, status_verbose: 'product not found' })

const rusks = {
  product_name: 'Buttermilk Rusks',
  brands: 'Ouma, Pioneer Foods',
  serving_quantity: '42',
  nutriments: {
    'energy-kcal_100g': 420,
    proteins_100g: '8.2',
    carbohydrates_100g: 66.4,
    fat_100g: 13.1,
  },
}

describe('barcode providers', () => {
  it('uses Open Food Facts by default, in the order FOOD_BARCODE_PROVIDERS lists, skipping ones without a key', () => {
    expect(barcodeProviders(env).map((p) => p.id)).toEqual(['openfoodfacts'])
    const both = { ...env, FOOD_BARCODE_PROVIDERS: 'usda, openfoodfacts, nope' }
    expect(barcodeProviders(both).map((p) => p.id)).toEqual(['openfoodfacts'])
    expect(barcodeProviders({ ...both, USDA_API_KEY: 'k' }).map((p) => p.id)).toEqual([
      'usda',
      'openfoodfacts',
    ])
  })

  it('reads an Open Food Facts product, saves it, and answers from the saved copy next time', async () => {
    const db = createDb(env.DB)
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(off(rusks))
    const product = await lookupBarcode(db, env, CODE)
    expect(product).toEqual({
      barcode: CODE,
      name: 'Buttermilk Rusks',
      brand: 'Ouma',
      per100g: { kcal: 420, proteinG: 8.2, carbsG: 66.4, fatG: 13.1 },
      servingG: 42,
      source: {
        provider: 'openfoodfacts',
        label: 'Open Food Facts',
        url: `https://world.openfoodfacts.org/product/${CODE}`,
      },
    })
    const [url, init] = spy.mock.calls[0] ?? []
    expect(String(url)).toContain(`/api/v2/product/${CODE}.json`)
    expect(new Headers(init?.headers).get('user-agent')).toMatch(/^Project180\/1\.0 \(.+\)$/)

    spy.mockClear()
    expect((await lookupBarcode(db, env, CODE))?.name).toBe('Buttermilk Rusks')
    expect(spy).not.toHaveBeenCalled()
  })

  it('turns kJ into kcal when only kJ is given, and skips products without nutrition', async () => {
    const db = createDb(env.DB)
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(off({ product_name: 'Juice', nutriments: { energy_100g: 184.1 } }))
      .mockResolvedValueOnce(off({ product_name: 'Mystery', nutriments: {} }))
    expect((await lookupBarcode(db, env, '6001000000017'))?.per100g.kcal).toBe(44)
    expect(await lookupBarcode(db, env, '6001000000024')).toBeNull()
  })

  it('falls back to the next provider when the first doesn’t know the product', async () => {
    const db = createDb(env.DB)
    const keyed = { ...env, FOOD_BARCODE_PROVIDERS: 'openfoodfacts,usda', USDA_API_KEY: 'k' }
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(off(null))
      .mockResolvedValueOnce(
        Response.json({
          foods: [
            {
              description: 'PEANUT BUTTER',
              brandOwner: 'Acme',
              gtinUpc: `0${'012345678905'}`,
              servingSize: 32,
              servingSizeUnit: 'g',
              foodNutrients: [
                { nutrientId: 1008, value: 594 },
                { nutrientId: 1003, value: 22 },
                { nutrientId: 1005, value: 22 },
                { nutrientId: 1004, value: 50 },
              ],
            },
          ],
        }),
      )
    const product = await lookupBarcode(db, keyed, '012345678905')
    expect(product).toMatchObject({
      name: 'PEANUT BUTTER',
      brand: 'Acme',
      per100g: { kcal: 594, proteinG: 22, carbsG: 22, fatG: 50 },
      servingG: 32,
      source: { provider: 'usda', url: null },
    })
  })

  it('remembers a barcode nobody knows for a week, but never a failure', async () => {
    const db = createDb(env.DB)
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(off(null))
    expect(await lookupBarcode(db, env, CODE)).toBeNull()
    expect(await lookupBarcode(db, env, CODE)).toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
    // A week later it asks again; this time the provider is down: a 502, nothing remembered.
    const later = Date.now() + 8 * 24 * 60 * 60 * 1000
    spy.mockRejectedValueOnce(new Error('offline'))
    await expect(lookupBarcode(db, env, CODE, later)).rejects.toMatchObject({ status: 502 })
    spy.mockResolvedValueOnce(off(rusks))
    expect((await lookupBarcode(db, env, CODE, later))?.name).toBe('Buttermilk Rusks')
  })
})

describe('barcode route', () => {
  it('answers from the saved copy, 404 for an unknown product, 400 for a bad code', async () => {
    const { member } = await setupHousehold()
    await env.DB.prepare(
      `INSERT INTO food_products (barcode, found, provider, name, brand, kcal, protein_g, carbs_g, fat_g, serving_g, fetched_at)
       VALUES (?, 1, 'openfoodfacts', 'Rusks', 'Ouma', 420, 8.2, 66.4, 13.1, 42, ?), (?, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?)`,
    )
      .bind(CODE, Date.now(), '6009999999999', Date.now())
      .run()
    const found = await call<Json>(`/me/food/barcode/${CODE}`, { cookie: member })
    expect(found.status).toBe(200)
    expect(found.data.product).toMatchObject({ name: 'Rusks', servingG: 42 })
    expect((await call('/me/food/barcode/6009999999999', { cookie: member })).status).toBe(404)
    expect((await call('/me/food/barcode/12ab', { cookie: member })).status).toBe(400)
    expect((await call(`/me/food/barcode/${CODE}`)).status).toBe(401)
  })
})
