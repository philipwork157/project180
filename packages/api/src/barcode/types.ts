import type { MacroTotals } from '@project180/shared'
import type { Bindings } from '../env'

/** What a provider found for a barcode, values per 100 g. */
export interface ProviderProduct {
  name: string
  brand: string | null
  per100g: MacroTotals
  servingG: number | null
}

/**
 * One source of product data. To add another, write one of these in its own file and list it
 * in PROVIDERS (barcode/index.ts); FOOD_BARCODE_PROVIDERS then picks which run, in which order.
 */
export interface BarcodeProvider {
  /** The name used in FOOD_BARCODE_PROVIDERS, e.g. "openfoodfacts". */
  id: string
  /** Shown under the numbers in the app, e.g. "Open Food Facts". */
  label: string
  /** False when it needs a key this site doesn't have; it's then skipped. */
  configured: (env: Bindings) => boolean
  /** The product, or null when this provider doesn't know it (or has no nutrition for it). Throws on a failure. */
  lookup: (env: Bindings, barcode: string) => Promise<ProviderProduct | null>
  /** A page about the product, for the credit link, if the provider has one. */
  productUrl?: (env: Bindings, barcode: string) => string
  /**
   * Foods whose name matches what was typed, best first (at most `limit`). Providers without a
   * name search leave it out. Throws on a failure.
   */
  search?: (env: Bindings, query: string, limit: number) => Promise<ProviderSearchHit[]>
}

/** A food found by name. `code` is the barcode, or the provider's own id for foods without one. */
export interface ProviderSearchHit extends ProviderProduct {
  code: string
  barcode: string | null
  /** A page about this food, for the credit link. */
  url: string | null
}

/** A number from a provider's JSON (they send numbers or strings), or null. */
export function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number.parseFloat(value) : value
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

export const LOOKUP_TIMEOUT_MS = 8000
