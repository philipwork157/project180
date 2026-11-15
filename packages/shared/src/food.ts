// Food logging: what someone ate, their coach's daily targets, and the photo estimate.
// Calories and protein always have a number; carbs, fat and grams may be left empty.
import { z } from 'zod'
import { isoDate } from './validators'

/** The four meals of a day, in the order they show. */
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type Meal = (typeof MEALS)[number]
export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
}

/** How a food was added. */
export const FOOD_SOURCES = ['manual', 'photo', 'barcode', 'search'] as const
export type FoodSource = (typeof FOOD_SOURCES)[number]

/**
 * Photo estimates per person per day, so a bug or a keen tester can't run up the Claude bill.
 * Clients get the site default (the owner changes it in Settings) unless their coach set their
 * own number. Owners aren't held to it, but still have a safety net.
 */
export const DEFAULT_FOOD_PHOTOS_PER_DAY = 10
export const OWNER_FOOD_PHOTOS_PER_DAY = 100
/** The highest daily limit anyone can be given. */
export const MAX_FOOD_PHOTOS_PER_DAY = 50
/** Most foods one request may add (one photo rarely shows more than a handful). */
export const MAX_FOODS_PER_ADD = 12
/** How far back "Recent" looks. */
export const RECENT_FOOD_DAYS = 30

export interface MacroTotals {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

export interface FoodEntry {
  id: number
  clientUuid: string
  date: string
  meal: Meal
  name: string
  grams: number | null
  kcal: number
  proteinG: number
  carbsG: number | null
  fatG: number | null
  source: FoodSource
  createdAt: string
}

/** The coach's daily targets for a client. Carbs and fat are optional. */
export interface NutritionTargets {
  kcal: number
  proteinG: number
  carbsG: number | null
  fatG: number | null
  updatedAt: string
}

/** One day: every food, the totals, and the targets to measure them against. */
export interface FoodDay {
  date: string
  entries: FoodEntry[]
  totals: MacroTotals
  targets: NutritionTargets | null
}

export interface FoodDayTotals extends MacroTotals {
  date: string
  entries: number
}

/** Totals per day over a range (only days with food), for week strips and the coach's card. */
export interface FoodSummary {
  from: string
  to: string
  days: FoodDayTotals[]
  targets: NutritionTargets | null
}

/** A food logged lately, to add again in two taps. */
export interface RecentFood {
  name: string
  grams: number | null
  kcal: number
  proteinG: number
  carbsG: number | null
  fatG: number | null
}

export const PHOTO_CONFIDENCE = ['low', 'medium', 'high'] as const
export type PhotoConfidence = (typeof PHOTO_CONFIDENCE)[number]

/** One food Claude found in a photo. Every number is an estimate the person checks. */
export interface FoodPhotoItem {
  name: string
  grams: number | null
  kcal: number
  proteinG: number
  carbsG: number | null
  fatG: number | null
  confidence: PhotoConfidence
}

/** What a photo turned into: a draft, never saved until the person confirms it. */
export interface FoodPhotoDraft {
  kind: 'meal' | 'label' | 'not_food'
  items: FoodPhotoItem[]
  /** A nutrition label: its values per 100 g and the serving printed on it. */
  label: { per100g: MacroTotals; servingG: number | null } | null
  /** A short note from Claude, e.g. "Oil and sauce are hard to see". */
  note: string | null
  photosLeft: number
}

/** Can this site estimate food from photos? (The app hides the button when it can't.) */
export interface FoodSetup {
  photos: boolean
  photosPerDay: number
  /** At least one barcode provider is switched on for this site. */
  barcode: boolean
  /** At least one provider can search foods by name here. */
  search: boolean
}

/** A packaged product found by its barcode, with values per 100 g (what labels print). */
export interface BarcodeProduct {
  barcode: string
  name: string
  brand: string | null
  per100g: MacroTotals
  /** The serving printed on the pack, in grams, when the provider knows it. */
  servingG: number | null
  /** Where the data came from, shown under the numbers (some licences require a credit). */
  source: { provider: string; label: string; url: string | null }
}

/** A food found by searching its name: like a barcode product, but not every food has a code. */
export type FoodSearchResult = Omit<BarcodeProduct, 'barcode'> & {
  /** Unique in the list, e.g. "openfoodfacts:6001007000000". */
  id: string
  barcode: string | null
}

/** What someone typed to search foods: 2 to 60 characters. */
export const foodSearchInput = z.string().trim().min(2, 'Type a bit more').max(60)

/** The same search however it was typed ("  Eggs " and "eggs" share one saved answer). */
export const normalizeFoodQuery = (q: string) => q.trim().toLowerCase().replace(/\s+/g, ' ')

/** A word without a plural "s", so "eggs" and "egg" count as the same word. */
const oneOf = (word: string) => word.replace(/s$/, '')

/**
 * Puts the closest names first, each group in the providers' order: the typed word as the
 * name's first word ("Egg, whole" for "eggs"), then every typed word as a whole word ("Large
 * eggs"), then a name that starts with what was typed ("Eggplant"), then every typed word as the
 * start of a word, then names containing them, then the rest. Drops repeats (same name and
 * brand) and anything with no calories and no protein (nothing to log).
 */
export function rankFoodResults<T extends Pick<FoodSearchResult, 'name' | 'brand' | 'per100g'>>(
  query: string,
  results: T[],
): T[] {
  const q = normalizeFoodQuery(query)
  const words = q.split(' ').map(oneOf).filter(Boolean)
  const seen = new Set<string>()
  const score = (r: T) => {
    const name = normalizeFoodQuery(r.name)
    const nameWords = name.split(/[^a-z0-9]+/).filter(Boolean)
    const whole = words.every((w) => nameWords.some((n) => oneOf(n) === w))
    if (whole && oneOf(nameWords[0] ?? '') === words[0]) return 0
    if (whole) return 1
    if (name.startsWith(q)) return 2
    if (words.every((w) => nameWords.some((n) => n.startsWith(w)))) return 3
    if (words.every((w) => name.includes(w))) return 4
    return 5
  }
  return results
    .map((r, i) => ({ r, i, s: score(r) }))
    .filter(({ r }) => {
      const key = `${normalizeFoodQuery(r.name)}|${normalizeFoodQuery(r.brand ?? '')}`
      if (seen.has(key) || (r.per100g.kcal <= 0 && r.per100g.proteinG <= 0)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map(({ r }) => r)
}

/** EAN-8, UPC-A (12), EAN-13 or GTIN-14: digits only. */
export const barcodeInput = z
  .string()
  .trim()
  .regex(/^(\d{8}|\d{12,14})$/, 'Not a product barcode')

/** Rounds kcal to whole numbers and grams of anything to one decimal. */
export const roundKcal = (n: number) => Math.round(n)
export const roundGrams = (n: number) => Math.round(n * 10) / 10

/** Adds up a list of foods. Empty carbs or fat count as zero. */
export function sumMacros(
  items: ReadonlyArray<{
    kcal: number
    proteinG: number
    carbsG?: number | null
    fatG?: number | null
  }>,
): MacroTotals {
  let kcal = 0
  let proteinG = 0
  let carbsG = 0
  let fatG = 0
  for (const i of items) {
    kcal += i.kcal
    proteinG += i.proteinG
    carbsG += i.carbsG ?? 0
    fatG += i.fatG ?? 0
  }
  return {
    kcal: roundKcal(kcal),
    proteinG: roundGrams(proteinG),
    carbsG: roundGrams(carbsG),
    fatG: roundGrams(fatG),
  }
}

/** A nutrition label's per-100 g values for the amount actually eaten. */
export function scaleLabel(per100g: MacroTotals, grams: number): MacroTotals {
  const f = Math.max(0, grams) / 100
  return {
    kcal: roundKcal(per100g.kcal * f),
    proteinG: roundGrams(per100g.proteinG * f),
    carbsG: roundGrams(per100g.carbsG * f),
    fatG: roundGrams(per100g.fatG * f),
  }
}

/** The meal a new food most likely belongs to, from the local hour (0–23). */
export function mealForHour(hour: number): Meal {
  if (hour >= 4 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 16) return 'lunch'
  if (hour >= 17 && hour < 22) return 'dinner'
  return 'snack'
}

/** How far towards a target, 0 to 1 (more than the target still shows as full). */
export function targetShare(eaten: number, target: number | null | undefined): number {
  if (!target || target <= 0) return 0
  return Math.min(1, Math.max(0, eaten / target))
}

/** The three macros in the order every chart shows them, with energy per gram. */
export const MACROS = [
  { key: 'proteinG', label: 'Protein', kcalPerGram: 4 },
  { key: 'carbsG', label: 'Carbs', kcalPerGram: 4 },
  { key: 'fatG', label: 'Fat', kcalPerGram: 9 },
] as const
export type MacroKey = (typeof MACROS)[number]['key']

/**
 * Share of energy from protein, carbs and fat (0–1 each, adding up to 1), from the grams.
 * All zeros when nothing has been logged.
 */
export function energySplit(t: Pick<MacroTotals, MacroKey>): Record<MacroKey, number> {
  const kcal = MACROS.map((m) => Math.max(0, t[m.key]) * m.kcalPerGram)
  const total = kcal.reduce((a, b) => a + b, 0)
  const [proteinG = 0, carbsG = 0, fatG = 0] = kcal.map((k) => (total > 0 ? k / total : 0))
  return { proteinG, carbsG, fatG }
}

/** "1 850" style numbers for kcal; grams with at most one decimal. */
export const kcalLabel = (n: number) => roundKcal(n).toLocaleString('en-ZA')
export const gramsLabel = (n: number) => String(roundGrams(n))

const foodName = z.string().trim().min(1, 'Required').max(120)
const optionalAmount = (max: number) => z.number().min(0).max(max).nullish()

/** One food's name and numbers (typed in, or a checked photo estimate). */
export const foodItemInput = z.object({
  name: foodName,
  grams: optionalAmount(5000),
  kcal: z.number().min(0).max(5000),
  proteinG: z.number().min(0).max(500),
  carbsG: optionalAmount(1000),
  fatG: optionalAmount(500),
})

/** Adds one or more foods to a meal. Each carries an id made on the phone, so retries never save twice. */
export const addFoodInput = z.object({
  date: isoDate,
  meal: z.enum(MEALS),
  source: z.enum(FOOD_SOURCES).default('manual'),
  entries: z
    .array(foodItemInput.extend({ clientUuid: z.uuid() }))
    .min(1)
    .max(MAX_FOODS_PER_ADD),
})

/** Changing a food already logged (any of its fields, or moving it to another meal). */
export const updateFoodInput = foodItemInput.partial().extend({ meal: z.enum(MEALS).optional() })

/** The coach sets daily targets: calories and protein, and carbs and fat if they want. */
export const nutritionTargetsInput = z.object({
  kcal: z.number().int().min(800).max(6000),
  proteinG: z.number().int().min(20).max(400),
  carbsG: z.number().int().min(0).max(1000).nullish(),
  fatG: z.number().int().min(0).max(400).nullish(),
})

/** A hint typed with a photo, e.g. "200 g chicken, cooked in oil". */
export const foodPhotoHint = z.string().trim().max(200)

/** The owner's switch for photo estimates, and whether this site has a Claude key at all. */
export interface FoodPhotoSettings {
  /** The owner's choice (on unless an owner turned it off). */
  enabled: boolean
  /** ANTHROPIC_API_KEY is set on this site. Photos work only when both are true. */
  configured: boolean
  /** Photos a day for every client without their own limit. */
  perDay: number
  updatedAt: string | null
}

const photosPerDay = z.number().int().min(0).max(MAX_FOOD_PHOTOS_PER_DAY)

/** The owner changes the switch, the default daily limit, or both. */
export const foodPhotoSettingsInput = z
  .object({ enabled: z.boolean().optional(), perDay: photosPerDay.optional() })
  .refine((v) => v.enabled !== undefined || v.perDay !== undefined, 'Nothing to change')

/** One person's photo limit, as their coach sees it. */
export interface PhotoLimit {
  /** Their own limit, or null to use the site default. 0 = no photos for them. */
  perDay: number | null
  /** The site default. */
  defaultPerDay: number
  /** What applies to them now (owners always get OWNER_FOOD_PHOTOS_PER_DAY). */
  effective: number
  /** Photos they've taken today. */
  usedToday: number
}

/** A coach sets a client's own daily limit, or null to go back to the site default. */
export const photoLimitInput = z.object({ perDay: photosPerDay.nullable() })
