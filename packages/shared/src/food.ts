// Food logging: what someone ate, their coach's daily targets, and the photo estimate.
// Calories and protein always have a number; carbs, fat and grams may be left empty.
import { z } from 'zod'
import type { DayBurn } from './burn'
import { addDays } from './dates'
import { MAX_WEEKLY_CHANGE_KG, MIN_WEEKLY_CHANGE_KG } from './energy'
import { ACTIVITY_LEVELS, SEXES } from './enums'
import { isoDate } from './validators'
import type { AppNotification } from './weigh-in'

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
export const FOOD_SOURCES = ['manual', 'photo', 'barcode', 'search', 'recipe', 'describe'] as const
export type FoodSource = (typeof FOOD_SOURCES)[number]

/**
 * Photo estimates per person per day, so a bug or a keen tester can't run up the Claude bill.
 * Clients get the site default (the owner changes it in Settings) unless their coach set their
 * own number. Nobody goes past the platform admin's hard limit (owners get exactly that).
 */
export const DEFAULT_FOOD_PHOTOS_PER_DAY = 10
/** The highest default or own number an owner or coach can set (the hard limit still applies). */
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

/** Optional extras some foods carry (barcodes, the food database, typed in). */
export interface NutrientExtras {
  fibreG: number | null
  sugarG: number | null
  sodiumMg: number | null
}

/** A day's extras added up; null when no food that day had any. */
export type ExtrasTotals = { [K in keyof NutrientExtras]: number | null }

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
  fibreG: number | null
  sugarG: number | null
  sodiumMg: number | null
  source: FoodSource
  createdAt: string
}

/** The coach's daily targets for a client. Carbs and fat are optional. */
export interface NutritionTargets {
  kcal: number
  proteinG: number
  carbsG: number | null
  fatG: number | null
  /** The weight the calculator worked them out on (null when typed in by hand). */
  basisWeightKg: number | null
  /** Their goal from their profile, for the line on Fuel. */
  goalWeightKg: number | null
  weeklyChangeKg: number | null
  updatedAt: string
}

/** One day: every food, the totals, and the targets to measure them against. */
export interface FoodDay {
  date: string
  entries: FoodEntry[]
  totals: MacroTotals
  /** Fibre, sugar and sodium, from the foods that had them. */
  extras: ExtrasTotals
  targets: NutritionTargets | null
  /** Exercise that day: added to the calorie target (Target + Exercise − Food = left). */
  burned: DayBurn
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
  /** kcal burned per day (only days with some), added to that day's target. */
  burned: { date: string; kcal: number }[]
}

/** A food logged lately, to add again in two taps. */
export interface RecentFood extends Partial<NutrientExtras> {
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
  /** Typical values for the food and portion; null when Claude couldn't tell. */
  fibreG: number | null
  sugarG: number | null
  sodiumMg: number | null
  confidence: PhotoConfidence
}

/** What a photo turned into: a draft, never saved until the person confirms it. */
export interface FoodPhotoDraft {
  kind: 'meal' | 'label' | 'not_food'
  items: FoodPhotoItem[]
  /** A nutrition label: its values per 100 g and the serving printed on it. */
  label: { per100g: MacroTotals & Partial<NutrientExtras>; servingG: number | null } | null
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
  /** Per 100 g. Fibre, sugar and sodium when the provider has them (older saved copies don't). */
  per100g: MacroTotals & Partial<NutrientExtras>
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

/** Adds up fibre, sugar and sodium; each stays null when no food had it. */
export function sumExtras(items: ReadonlyArray<Partial<NutrientExtras>>): ExtrasTotals {
  const add = (key: keyof NutrientExtras) => {
    const known = items.map((i) => i[key]).filter((v): v is number => v != null)
    if (known.length === 0) return null
    const total = known.reduce((a, b) => a + b, 0)
    return key === 'sodiumMg' ? Math.round(total) : roundGrams(total)
  }
  return { fibreG: add('fibreG'), sugarG: add('sugarG'), sodiumMg: add('sodiumMg') }
}

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

/** Fibre, sugar and sodium for an amount, from values per 100 g (unknowns stay null). */
export function scaleExtras(per100g: Partial<NutrientExtras>, grams: number): NutrientExtras {
  const f = Math.max(0, grams) / 100
  const at = (v: number | null | undefined, round: (n: number) => number) =>
    v == null ? null : round(v * f)
  return {
    fibreG: at(per100g.fibreG, roundGrams),
    sugarG: at(per100g.sugarG, roundGrams),
    sodiumMg: at(per100g.sodiumMg, Math.round),
  }
}

/** Every number a food carries, in the order forms show them. */
export const NUTRIENT_KEYS = [
  'kcal',
  'proteinG',
  'carbsG',
  'fatG',
  'fibreG',
  'sugarG',
  'sodiumMg',
] as const
export type NutrientKey = (typeof NUTRIENT_KEYS)[number]
export type Nutrients = Record<NutrientKey, number | null>

/**
 * How much of each nutrient is in one gram, from a food's numbers and its weight: what lets the
 * numbers follow the grams. Null without a weight (nothing to work from). Kept unrounded, so
 * typing 1, 10, 100 never adds up rounding errors.
 */
export function perGram(food: Partial<Nutrients>, grams: number | null | undefined) {
  if (!grams || grams <= 0) return null
  const basis = {} as Nutrients
  for (const key of NUTRIENT_KEYS) {
    const v = food[key]
    basis[key] = v == null ? null : v / grams
  }
  return basis
}

/** A food's numbers for a weight, from its per-gram values (unknowns stay null). */
export function forGrams(basis: Nutrients, grams: number): Nutrients {
  const g = Math.max(0, grams)
  const out = {} as Nutrients
  for (const key of NUTRIENT_KEYS) {
    const v = basis[key]
    out[key] =
      v == null
        ? null
        : key === 'kcal'
          ? roundKcal(v * g)
          : key === 'sodiumMg'
            ? Math.round(v * g)
            : roundGrams(v * g)
  }
  return out
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
  fibreG: optionalAmount(200),
  sugarG: optionalAmount(500),
  sodiumMg: optionalAmount(20000),
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
  /** The weight the calculator used, when the coach used it. */
  basisWeightKg: z.number().min(25).max(400).nullish(),
  /** What the calculator was set to: saved on their profile with the targets. */
  plan: z
    .object({
      activityLevel: z.enum(ACTIVITY_LEVELS).nullable(),
      weeklyChangeKg: z.number().min(MIN_WEEKLY_CHANGE_KG).max(MAX_WEEKLY_CHANGE_KG).nullable(),
      goalWeightKg: z.number().min(25).max(400).nullable(),
      // Body basics typed into the calculator; left out = unchanged.
      birthDate: isoDate.nullish(),
      sex: z.enum(SEXES).nullish(),
      heightCm: z.number().min(80).max(250).nullish(),
      /** Their weight today: saved as today's weigh-in when it's new. */
      weightKg: z.number().min(25).max(400).nullish(),
    })
    .optional(),
})

/** A hint typed with a photo, e.g. "200 g chicken, cooked in oil". */
export const foodPhotoHint = z.string().trim().max(200)

/** "Type it in words": what someone ate, in their own words ("2 eggs, toast with butter"). */
export const foodDescribeInput = z.object({
  text: z.string().trim().min(2, 'Say what you ate').max(500),
})

/** A food starred to log again in one tap. */
export interface FavouriteFood extends RecentFood {
  id: number
}

/** Starring a food: the same numbers a food is logged with. */
export const favouriteInput = foodItemInput

/** Favourites one person can keep. */
export const MAX_FAVOURITES = 100

/** Photo estimates as the owner sees them, and whether this site has a Claude key at all. */
export interface FoodPhotoSettings {
  /** The platform admin's switch (on unless they turned it off). */
  enabled: boolean
  /** ANTHROPIC_API_KEY is set on this site. Photos work only when both are true. */
  configured: boolean
  /** Photos a day for every client without their own limit. */
  perDay: number
  updatedAt: string | null
}

const photosPerDay = z.number().int().min(0).max(MAX_FOOD_PHOTOS_PER_DAY)

/** The owner changes the default daily limit (the on/off switch is the platform admin's). */
export const foodPhotoSettingsInput = z.object({ perDay: photosPerDay })

/** One person's photo limit, as their coach sees it. */
export interface PhotoLimit {
  /** Their own limit, or null to use the site default. 0 = no photos for them. */
  perDay: number | null
  /** The site default. */
  defaultPerDay: number
  /** What applies to them now, never past the platform's hard limit (owners get that limit). */
  effective: number
  /** Photos they've taken today. */
  usedToday: number
  /** Owners aren't held to the default or their own number, only the hard limit. */
  owner: boolean
}

/** A coach sets a client's own daily limit, or null to go back to the site default. */
export const photoLimitInput = z.object({ perDay: photosPerDay.nullable() })

/** One food in a saved meal (values for the amount eaten). */
export interface SavedMealItem {
  name: string
  grams: number | null
  kcal: number
  proteinG: number
  carbsG: number | null
  fatG: number | null
  fibreG: number | null
  sugarG: number | null
  sodiumMg: number | null
  source: FoodSource
}

/** Most foods a saved meal can hold, and saved meals per person. */
export const MAX_SAVED_MEAL_ITEMS = 30
export const MAX_SAVED_MEALS = 50

export interface SavedMeal {
  id: number
  name: string
  items: SavedMealItem[]
  kcal: number
  proteinG: number
}

/** Saves the foods of one logged meal under a name. */
export const saveMealInput = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(60),
  date: isoDate,
  meal: z.enum(MEALS),
})

/** Logs a saved meal, or copies a logged meal to another day. The id makes retries safe. */
export const logSavedMealInput = z.object({
  clientUuid: z.uuid(),
  date: isoDate,
  meal: z.enum(MEALS),
})
export const copyMealInput = logSavedMealInput.extend({
  fromDate: isoDate,
  fromMeal: z.enum(MEALS),
})

/**
 * Days in a row with food logged, up to `today`. Today not logged yet doesn't break it: the
 * streak runs to yesterday. `days` are the logged days (any order).
 */
export function foodStreak(days: readonly string[], today: string): number {
  const logged = new Set(days)
  let day = logged.has(today) ? today : addDays(today, -1)
  let n = 0
  while (logged.has(day)) {
    n += 1
    day = addDays(day, -1)
  }
  return n
}

/** Food logging reminders: one evening push when little is logged that day. */
export const FOOD_REMINDER_HOUR = 19
/** A day with fewer meals than this logged gets the reminder. */
export const FOOD_REMINDER_MIN_MEALS = 2

/**
 * The bell's copy of the evening food reminder: from 19:00, when it's on and fewer than two
 * meals are logged today. It clears itself once they log.
 */
export function foodReminderNotification(input: {
  on: boolean
  today: string
  hour: number
  mealsToday: number
}): AppNotification | null {
  if (!input.on || input.hour < FOOD_REMINDER_HOUR) return null
  if (input.mealsToday >= FOOD_REMINDER_MIN_MEALS) return null
  return {
    id: `food:${input.today}`,
    kind: 'food',
    title: 'Log today’s food',
    body: 'A minute now keeps your calories right.',
  }
}
