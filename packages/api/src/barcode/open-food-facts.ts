// Open Food Facts: free, no key, crowd-sourced, worldwide. Data under the ODbL: show the credit
// and keep it in its own table (food_products). Reads are limited to 15 a minute per IP address,
// which is why every result is saved. https://openfoodfacts.github.io/documentation/
import { roundGrams, roundKcal } from '@project180/shared'
import type { Bindings } from '../env'
import { type BarcodeProvider, LOOKUP_TIMEOUT_MS, num } from './types'

const DEFAULT_URL = 'https://world.openfoodfacts.org'
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

interface OffResponse {
  status?: number
  product?: {
    product_name?: string
    product_name_en?: string
    generic_name?: string
    brands?: string
    serving_quantity?: number | string
    serving_quantity_unit?: string
    nutriments?: Record<string, unknown>
  }
}

export const openFoodFacts: BarcodeProvider = {
  id: 'openfoodfacts',
  label: 'Open Food Facts',
  configured: () => true,
  productUrl: (env, barcode) => `${baseUrl(env)}/product/${barcode}`,
  async lookup(env, barcode) {
    const res = await fetch(`${baseUrl(env)}/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
      headers: {
        // They ask every app to say who it is: AppName/Version (contact).
        'user-agent': `Project180/1.0 (${env.FOOD_LOOKUP_CONTACT || 'hello@project180.co.za'})`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`)
    const data = (await res.json()) as OffResponse
    const p = data.product
    if (data.status !== 1 || !p) return null
    const n = p.nutriments ?? {}
    // Energy: kcal when given, otherwise kJ (energy_100g is kJ) converted.
    const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g)
    const kcal = num(n['energy-kcal_100g']) ?? (kj === null ? null : kj / 4.184)
    const protein = num(n.proteins_100g)
    // Without calories or protein there is nothing useful to log.
    if (kcal === null && protein === null) return null
    const unit = (p.serving_quantity_unit ?? 'g').toLowerCase()
    const serving = unit === 'g' || unit === 'ml' ? num(p.serving_quantity) : null
    const name = (p.product_name || p.product_name_en || p.generic_name || '').trim()
    return {
      name: name || `Product ${barcode}`,
      brand: p.brands?.split(',')[0]?.trim() || null,
      per100g: {
        kcal: roundKcal(kcal ?? 0),
        proteinG: roundGrams(protein ?? 0),
        carbsG: roundGrams(num(n.carbohydrates_100g) ?? 0),
        fatG: roundGrams(num(n.fat_100g) ?? 0),
      },
      servingG: serving && serving > 0 ? roundGrams(serving) : null,
    }
  },
}
