// USDA FoodData Central: free with a key (USDA_API_KEY), public domain (CC0), 1,000 requests an
// hour. Barcodes come from its "Branded" foods (mostly American products, so it works best as a
// second provider). Searching by name also finds its plain foods ("Egg, whole, raw, fresh"),
// which is what people usually mean by "egg". https://fdc.nal.usda.gov/api-guide
import { roundGrams, roundKcal } from '@project180/shared'
import {
  type BarcodeProvider,
  LOOKUP_TIMEOUT_MS,
  num,
  type ProviderProduct,
  type ProviderSearchHit,
} from './types'

interface UsdaFood {
  fdcId?: number
  dataType?: string
  description?: string
  brandName?: string
  brandOwner?: string
  gtinUpc?: string
  servingSize?: number
  servingSizeUnit?: string
  foodNutrients?: Array<{ nutrientId?: number; nutrientNumber?: string; value?: number }>
}

// Nutrient ids (and their older numbers): energy kcal, protein, carbs, fat. Plain foods
// sometimes give energy only as the Atwater figures (2047 general, 2048 specific).
const NUTRIENTS = {
  kcal: [1008, '208'],
  kcalAtwater: [2047, '957'],
  kcalAtwaterSpecific: [2048, '958'],
  proteinG: [1003, '203'],
  carbsG: [1005, '205'],
  fatG: [1004, '204'],
} as const

const sameCode = (a: string, b: string) => a.replace(/^0+/, '') === b.replace(/^0+/, '')

/** A food's values per 100 g (FoodData Central gives every nutrient per 100 g), or null. */
function readFood(food: UsdaFood): ProviderProduct | null {
  const value = ([id, number]: readonly [number, string]) =>
    num(food.foodNutrients?.find((x) => x.nutrientId === id || x.nutrientNumber === number)?.value)
  const kcal =
    value(NUTRIENTS.kcal) ?? value(NUTRIENTS.kcalAtwaterSpecific) ?? value(NUTRIENTS.kcalAtwater)
  const protein = value(NUTRIENTS.proteinG)
  if (kcal === null && protein === null) return null
  const unit = (food.servingSizeUnit ?? '').toLowerCase()
  const serving = unit === 'g' || unit === 'grm' || unit === 'ml' ? num(food.servingSize) : null
  return {
    name: food.description?.trim() ?? '',
    brand: food.brandName?.trim() || food.brandOwner?.trim() || null,
    per100g: {
      kcal: roundKcal(kcal ?? 0),
      proteinG: roundGrams(protein ?? 0),
      carbsG: roundGrams(value(NUTRIENTS.carbsG) ?? 0),
      fatG: roundGrams(value(NUTRIENTS.fatG) ?? 0),
    },
    servingG: serving && serving > 0 ? roundGrams(serving) : null,
  }
}

async function searchFoods(
  env: { USDA_API_KEY?: string },
  query: string,
  dataType: string,
  pageSize: number,
): Promise<UsdaFood[]> {
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search')
  url.searchParams.set('api_key', env.USDA_API_KEY ?? '')
  url.searchParams.set('query', query)
  url.searchParams.set('dataType', dataType)
  url.searchParams.set('pageSize', String(pageSize))
  const res = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`USDA answered ${res.status}`)
  return ((await res.json()) as { foods?: UsdaFood[] }).foods ?? []
}

export const usda: BarcodeProvider = {
  id: 'usda',
  label: 'USDA FoodData Central',
  configured: (env) => Boolean(env.USDA_API_KEY),
  async lookup(env, barcode) {
    const foods = await searchFoods(env, barcode, 'Branded', 10)
    const food = foods.find((f) => f.gtinUpc && sameCode(f.gtinUpc, barcode))
    const product = food ? readFood(food) : null
    return product && { ...product, name: product.name || `Product ${barcode}` }
  },
  async search(env, query, limit) {
    // Plain foods first ("Egg, whole, raw"), then branded ones.
    const foods = await searchFoods(env, query, 'Foundation,SR Legacy,Branded', limit * 2)
    const plain = (f: UsdaFood) => (f.dataType === 'Branded' ? 1 : 0)
    const hits: ProviderSearchHit[] = []
    for (const food of [...foods].sort((a, b) => plain(a) - plain(b))) {
      const product = readFood(food)
      if (!product?.name || !food.fdcId) continue
      const barcode = food.gtinUpc && /^\d{8,14}$/.test(food.gtinUpc) ? food.gtinUpc : null
      hits.push({
        ...product,
        code: String(food.fdcId),
        barcode,
        url: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`,
      })
      if (hits.length === limit) break
    }
    return hits
  },
}
