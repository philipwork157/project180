// USDA FoodData Central "Branded" foods: free with a key (USDA_API_KEY), public domain (CC0),
// 1,000 requests an hour. Mostly American products, so it works best as a second provider.
// https://fdc.nal.usda.gov/api-guide
import { roundGrams, roundKcal } from '@project180/shared'
import { type BarcodeProvider, LOOKUP_TIMEOUT_MS, num } from './types'

interface UsdaFood {
  description?: string
  brandName?: string
  brandOwner?: string
  gtinUpc?: string
  servingSize?: number
  servingSizeUnit?: string
  foodNutrients?: Array<{ nutrientId?: number; nutrientNumber?: string; value?: number }>
}

// Nutrient ids (and their older numbers): energy kcal, protein, carbs, fat.
const NUTRIENTS = {
  kcal: [1008, '208'],
  proteinG: [1003, '203'],
  carbsG: [1005, '205'],
  fatG: [1004, '204'],
} as const

const sameCode = (a: string, b: string) => a.replace(/^0+/, '') === b.replace(/^0+/, '')

export const usda: BarcodeProvider = {
  id: 'usda',
  label: 'USDA FoodData Central',
  configured: (env) => Boolean(env.USDA_API_KEY),
  async lookup(env, barcode) {
    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
    url.searchParams.set('api_key', env.USDA_API_KEY ?? '')
    url.searchParams.set('query', barcode)
    url.searchParams.set('dataType', 'Branded')
    url.searchParams.set('pageSize', '10')
    const res = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`USDA answered ${res.status}`)
    const data = (await res.json()) as { foods?: UsdaFood[] }
    const food = data.foods?.find((f) => f.gtinUpc && sameCode(f.gtinUpc, barcode))
    if (!food) return null
    // Branded foods give each nutrient per 100 g.
    const value = ([id, number]: readonly [number, string]) =>
      num(food.foodNutrients?.find((x) => x.nutrientId === id || x.nutrientNumber === number)?.value)
    const kcal = value(NUTRIENTS.kcal)
    const protein = value(NUTRIENTS.proteinG)
    if (kcal === null && protein === null) return null
    const unit = (food.servingSizeUnit ?? '').toLowerCase()
    const serving = unit === 'g' || unit === 'grm' || unit === 'ml' ? num(food.servingSize) : null
    return {
      name: food.description?.trim() || `Product ${barcode}`,
      brand: food.brandName?.trim() || food.brandOwner?.trim() || null,
      per100g: {
        kcal: roundKcal(kcal ?? 0),
        proteinG: roundGrams(protein ?? 0),
        carbsG: roundGrams(value(NUTRIENTS.carbsG) ?? 0),
        fatG: roundGrams(value(NUTRIENTS.fatG) ?? 0),
      },
      servingG: serving && serving > 0 ? roundGrams(serving) : null,
    }
  },
}
