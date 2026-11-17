// Open Food Facts: free, no key, crowd-sourced, worldwide. Data under the ODbL: show the credit
// and keep it in its own tables (food_products, food_searches). Reads are limited to 15 a minute
// per IP address, which is why every result is saved. https://openfoodfacts.github.io/documentation/
//
// Searching by name uses Search-a-licious (search.openfoodfacts.org), their search service made
// for this; the classic /cgi/search.pl (10 searches a minute per IP) is only the fallback.
import { roundGrams, roundKcal } from '@project180/shared'
import type { Bindings } from '../env'
import {
  type BarcodeProvider,
  LOOKUP_TIMEOUT_MS,
  num,
  type ProviderProduct,
  type ProviderSearchHit,
} from './types'

const DEFAULT_URL = 'https://world.openfoodfacts.org'
const DEFAULT_SEARCH_URL = 'https://search.openfoodfacts.org'
const FIELDS = [
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'nutriments',
  'serving_quantity',
  'serving_quantity_unit',
].join(',')

const baseUrl = (env: Bindings) => (env.OPEN_FOOD_FACTS_URL || DEFAULT_URL).replace(/\/$/, '')
const searchUrl = (env: Bindings) =>
  (env.OPEN_FOOD_FACTS_SEARCH_URL || DEFAULT_SEARCH_URL).replace(/\/$/, '')

/** A product as Open Food Facts sends it. Search can send names per language and brands as lists. */
interface OffProduct {
  code?: string
  product_name?: unknown
  product_name_en?: unknown
  generic_name?: unknown
  brands?: unknown
  serving_quantity?: number | string
  serving_quantity_unit?: string
  nutriments?: Record<string, unknown>
}

interface OffResponse {
  status?: number
  product?: OffProduct
}

/** They ask every app to say who it is: AppName/Version (contact). */
const headers = (env: Bindings) => ({
  'user-agent': `Project180/1.0 (${env.FOOD_LOOKUP_CONTACT || 'hello@project180.co.za'})`,
  accept: 'application/json',
})

/** A text that may come as a string, a list, or one value per language ({ en, main, … }). */
function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return text(value[0])
  if (value && typeof value === 'object') {
    const byLang = value as Record<string, unknown>
    return text(byLang.en ?? byLang.main ?? Object.values(byLang)[0])
  }
  return ''
}

const grams = (v: number | null) => (v === null ? null : roundGrams(v))
const milligrams = (g: number | null) => (g === null ? null : Math.round(g * 1000))
const divide = (v: number | null, by: number) => (v === null ? null : v / by)

/** Name, brand and values per 100 g, or null when there's no nutrition to log. */
function readProduct(p: OffProduct): ProviderProduct | null {
  const n = p.nutriments ?? {}
  // Energy: kcal when given, otherwise kJ (energy_100g is kJ) converted.
  const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g)
  const kcal = num(n['energy-kcal_100g']) ?? (kj === null ? null : kj / 4.184)
  const protein = num(n.proteins_100g)
  // Without calories or protein there is nothing useful to log.
  if (kcal === null && protein === null) return null
  const unit = (p.serving_quantity_unit ?? 'g').toLowerCase()
  const serving = unit === 'g' || unit === 'ml' ? num(p.serving_quantity) : null
  return {
    name: text(p.product_name) || text(p.product_name_en) || text(p.generic_name),
    brand: text(p.brands).split(',')[0]?.trim() || null,
    per100g: {
      kcal: roundKcal(kcal ?? 0),
      proteinG: roundGrams(protein ?? 0),
      carbsG: roundGrams(num(n.carbohydrates_100g) ?? 0),
      fatG: roundGrams(num(n.fat_100g) ?? 0),
      fibreG: grams(num(n.fiber_100g)),
      sugarG: grams(num(n.sugars_100g)),
      // Sodium in g per 100 g; from salt (sodium x 2.5) when only that is given.
      sodiumMg: milligrams(num(n.sodium_100g) ?? divide(num(n.salt_100g), 2.5)),
    },
    servingG: serving && serving > 0 ? roundGrams(serving) : null,
  }
}

/** Search hits worth showing: a name, nutrition, and a barcode to credit them by. */
function toHits(env: Bindings, products: OffProduct[], limit: number): ProviderSearchHit[] {
  const hits: ProviderSearchHit[] = []
  for (const p of products) {
    const code = typeof p.code === 'string' ? p.code.trim() : ''
    const product = /^\d{6,14}$/.test(code) ? readProduct(p) : null
    if (!product?.name) continue
    hits.push({ ...product, code, barcode: code, url: `${baseUrl(env)}/product/${code}` })
    if (hits.length === limit) break
  }
  return hits
}

async function getJson<T>(env: Bindings, url: string, what: string): Promise<T> {
  const res = await fetch(url, {
    headers: headers(env),
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${what} answered ${res.status}`)
  return (await res.json()) as T
}

export const openFoodFacts: BarcodeProvider = {
  id: 'openfoodfacts',
  label: 'Open Food Facts',
  configured: () => true,
  productUrl: (env, barcode) => `${baseUrl(env)}/product/${barcode}`,
  async lookup(env, barcode) {
    const res = await fetch(`${baseUrl(env)}/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
      headers: headers(env),
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`)
    const data = (await res.json()) as OffResponse
    if (data.status !== 1 || !data.product) return null
    const product = readProduct(data.product)
    return product && { ...product, name: product.name || `Product ${barcode}` }
  },
  async search(env, query, limit) {
    // Ask for a few extra: some have no nutrition and are skipped.
    const size = String(Math.min(limit * 2, 50))
    const fields = `code,${FIELDS}`
    try {
      const url = new URL(`${searchUrl(env)}/search`)
      url.searchParams.set('q', query)
      url.searchParams.set('langs', 'en')
      url.searchParams.set('page_size', size)
      url.searchParams.set('fields', fields)
      url.searchParams.set('boost_phrase', 'true')
      const data = await getJson<{ hits?: OffProduct[] }>(env, url.href, 'Search-a-licious')
      return toHits(env, data.hits ?? [], limit)
    } catch (err) {
      console.error('[food search] Search-a-licious failed, trying the classic search', err)
    }
    const url = new URL(`${baseUrl(env)}/cgi/search.pl`)
    url.searchParams.set('search_terms', query)
    url.searchParams.set('search_simple', '1')
    url.searchParams.set('action', 'process')
    url.searchParams.set('json', '1')
    url.searchParams.set('page_size', size)
    url.searchParams.set('fields', fields)
    const data = await getJson<{ products?: OffProduct[] }>(env, url.href, 'Open Food Facts search')
    return toHits(env, data.products ?? [], limit)
  },
}
