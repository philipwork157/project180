// Barcode lookups: try each switched-on provider in order, save what comes back (or that nobody
// knew it) in food_products, and answer from there next time.
//
// Switching providers needs no code change: FOOD_BARCODE_PROVIDERS lists them in the order to
// try, e.g. "openfoodfacts" (the default) or "openfoodfacts,usda". To add a new provider, write a
// BarcodeProvider (see open-food-facts.ts) and add it to PROVIDERS below.
import { type Db, foodProducts } from '@project180/db'
import type { BarcodeProduct } from '@project180/shared'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { Bindings } from '../env'
import { openFoodFacts } from './open-food-facts'
import type { BarcodeProvider, ProviderProduct } from './types'
import { usda } from './usda'

export const PROVIDERS: Record<string, BarcodeProvider> = {
  [openFoodFacts.id]: openFoodFacts,
  [usda.id]: usda,
}

const DEFAULT_PROVIDERS = 'openfoodfacts'
const DAY_MS = 24 * 60 * 60 * 1000
/** A product found is kept this long before asking again (labels change now and then). */
const KEEP_FOUND_MS = 90 * DAY_MS
/** A barcode nobody knew is asked about again after this (someone may have added it). */
const KEEP_MISSING_MS = 7 * DAY_MS

/** The providers this site uses, in the order to try them. Unknown names are skipped. */
export function barcodeProviders(env: Bindings): BarcodeProvider[] {
  const ids = (env.FOOD_BARCODE_PROVIDERS || DEFAULT_PROVIDERS)
    .split(',')
    .map((id) => id.trim().toLowerCase())
  return [...new Set(ids)]
    .map((id) => PROVIDERS[id])
    .filter((p): p is BarcodeProvider => p?.configured(env) === true)
}

function toProduct(
  env: Bindings,
  barcode: string,
  providerId: string,
  p: ProviderProduct,
): BarcodeProduct {
  const provider = PROVIDERS[providerId]
  return {
    barcode,
    name: p.name,
    brand: p.brand,
    per100g: p.per100g,
    servingG: p.servingG,
    source: {
      provider: providerId,
      label: provider?.label ?? providerId,
      url: provider?.productUrl?.(env, barcode) ?? null,
    },
  }
}

async function remember(
  db: Db,
  barcode: string,
  providerId: string | null,
  p: ProviderProduct | null,
) {
  const values = {
    found: p !== null,
    provider: providerId,
    name: p?.name ?? null,
    brand: p?.brand ?? null,
    kcal: p?.per100g.kcal ?? null,
    proteinG: p?.per100g.proteinG ?? null,
    carbsG: p?.per100g.carbsG ?? null,
    fatG: p?.per100g.fatG ?? null,
    servingG: p?.servingG ?? null,
    fetchedAt: new Date(),
  }
  await db
    .insert(foodProducts)
    .values({ barcode, ...values })
    .onConflictDoUpdate({ target: foodProducts.barcode, set: values })
}

/**
 * The product for a barcode, or null when no provider knows it. Answers 503 when no provider is
 * switched on, and 502 when every provider failed (nothing is remembered then, so it's retried).
 */
export async function lookupBarcode(
  db: Db,
  env: Bindings,
  barcode: string,
  now = Date.now(),
): Promise<BarcodeProduct | null> {
  const [saved] = await db.select().from(foodProducts).where(eq(foodProducts.barcode, barcode))
  if (saved) {
    const age = now - saved.fetchedAt.getTime()
    if (saved.found && saved.provider && saved.name && age < KEEP_FOUND_MS) {
      return toProduct(env, barcode, saved.provider, {
        name: saved.name,
        brand: saved.brand,
        per100g: {
          kcal: saved.kcal ?? 0,
          proteinG: saved.proteinG ?? 0,
          carbsG: saved.carbsG ?? 0,
          fatG: saved.fatG ?? 0,
        },
        servingG: saved.servingG,
      })
    }
    if (!saved.found && age < KEEP_MISSING_MS) return null
  }

  const providers = barcodeProviders(env)
  if (providers.length === 0)
    throw new HTTPException(503, { message: 'Barcode scanning isn’t set up yet.' })
  let answered = false
  for (const provider of providers) {
    try {
      const found = await provider.lookup(env, barcode)
      answered = true
      if (found) {
        await remember(db, barcode, provider.id, found)
        return toProduct(env, barcode, provider.id, found)
      }
    } catch (err) {
      // Never stop at one failing provider: the next one may know it.
      console.error(`[barcode] ${provider.id} failed for ${barcode}`, err)
    }
  }
  if (!answered)
    throw new HTTPException(502, {
      message: 'Couldn’t look that up right now. Try again, or photograph the label.',
    })
  await remember(db, barcode, null, null)
  return null
}
