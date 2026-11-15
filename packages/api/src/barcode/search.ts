// Finding foods by name ("egg"): every switched-on provider that can search is asked at once,
// the answers are ranked together, and the list is saved for a week (food_searches) so the same
// search is sent to the providers at most once a week, whoever types it.
import { type Db, foodSearches } from '@project180/db'
import { type FoodSearchResult, normalizeFoodQuery, rankFoodResults } from '@project180/shared'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { Bindings } from '../env'
import { barcodeProviders } from './index'
import type { BarcodeProvider } from './types'

/** Most results shown for one search. */
export const SEARCH_RESULTS = 25
/** Asked of each provider (their best matches; the rest are rarely what was meant). */
const PER_PROVIDER = 20
/** A saved search is used this long before asking again. */
const KEEP_MS = 7 * 24 * 60 * 60 * 1000

/** The switched-on providers that can search by name, in FOOD_BARCODE_PROVIDERS order. */
export function searchProviders(env: Bindings): BarcodeProvider[] {
  return barcodeProviders(env).filter((p) => p.search !== undefined)
}

/**
 * Foods matching `query`, best first. Answers 503 when no provider can search here, and 502
 * when every provider failed (nothing is saved then, so the next try asks again). One provider
 * failing still shows the others' foods.
 */
export async function searchFoods(
  db: Db,
  env: Bindings,
  query: string,
  now = Date.now(),
): Promise<FoodSearchResult[]> {
  const providers = searchProviders(env)
  if (providers.length === 0)
    throw new HTTPException(503, { message: 'Food search isn’t set up yet.' })
  const typed = normalizeFoodQuery(query)
  const key = `${providers.map((p) => p.id).join(',')}|${typed}`
  const [saved] = await db.select().from(foodSearches).where(eq(foodSearches.query, key))
  if (saved && now - saved.fetchedAt.getTime() < KEEP_MS) return saved.results

  const answers = await Promise.allSettled(
    providers.map(async (provider) => {
      const hits = (await provider.search?.(env, typed, PER_PROVIDER)) ?? []
      return hits.map(
        (h): FoodSearchResult => ({
          id: `${provider.id}:${h.code}`,
          barcode: h.barcode,
          name: h.name,
          brand: h.brand,
          per100g: h.per100g,
          servingG: h.servingG,
          source: { provider: provider.id, label: provider.label, url: h.url },
        }),
      )
    }),
  )
  answers.forEach((a, i) => {
    if (a.status === 'rejected')
      console.error(`[food search] ${providers[i]?.id} failed for "${typed}"`, a.reason)
  })
  if (answers.every((a) => a.status === 'rejected'))
    throw new HTTPException(502, {
      message: 'Couldn’t search right now. Try again in a minute, or type the food in.',
    })
  const found = answers.flatMap((a) => (a.status === 'fulfilled' ? a.value : []))
  const results = rankFoodResults(typed, found).slice(0, SEARCH_RESULTS)
  await db
    .insert(foodSearches)
    .values({ query: key, results, fetchedAt: new Date(now) })
    .onConflictDoUpdate({
      target: foodSearches.query,
      set: { results, fetchedAt: new Date(now) },
    })
  return results
}
