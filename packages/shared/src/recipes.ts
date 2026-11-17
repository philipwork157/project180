// Recipes: meals the coaches put together for everyone to cook. Macros are per serving; the
// ingredients scale with how many people you cook for. A serving can be logged to Fuel.
import { z } from 'zod'
import { MEAL_LABELS, MEALS, type Meal } from './food'

/**
 * What kind of recipe it is, for the chips in the app. Toddler recipes are kept apart: they
 * only show under their own chip, never in "All", and aren't logged to your own food log.
 */
export const RECIPE_CATEGORIES = [
  'meal',
  'smoothie',
  'pre_workout',
  'post_workout',
  'snack',
  'baking',
  'toddler',
] as const
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number]

export const RECIPE_CATEGORY_LABELS: Record<RecipeCategory, string> = {
  meal: 'Meals',
  smoothie: 'Smoothies',
  pre_workout: 'Pre-workout',
  post_workout: 'Post-workout',
  snack: 'Snacks',
  baking: 'Protein baking',
  toddler: 'Toddler',
}

/** "Breakfast recipe", "Smoothie", "Toddler recipe": what a recipe is, for its small label. */
export function recipeKindLabel(r: Pick<Recipe, 'meal' | 'category'>): string {
  switch (r.category) {
    case 'meal':
      return `${MEAL_LABELS[r.meal]} recipe`
    case 'smoothie':
      return 'Smoothie'
    case 'baking':
      return 'Protein baking'
    case 'toddler':
      return 'Toddler recipe'
    default:
      return RECIPE_CATEGORY_LABELS[r.category]
  }
}

/** Sort orders for recipe lists. */
export const RECIPE_SORTS = ['name', 'protein', 'quickest', 'lightest'] as const
export type RecipeSort = (typeof RECIPE_SORTS)[number]
export const RECIPE_SORT_LABELS: Record<RecipeSort, string> = {
  name: 'A to Z',
  protein: 'Most protein',
  quickest: 'Quickest',
  lightest: 'Fewest calories',
}

export const RECIPE_PAGE_SIZE = 12
export const MAX_RECIPE_PAGE_SIZE = 48

/** One ingredient line: "200 g chicken breast", "2 eggs", "salt and pepper". */
export interface RecipeIngredient {
  amount: number | null
  unit: string | null
  name: string
}

export interface Recipe {
  id: number
  title: string
  summary: string | null
  meal: Meal
  category: RecipeCategory
  servings: number
  prepMinutes: number
  cookMinutes: number
  /** Per serving. */
  kcal: number
  proteinG: number
  carbsG: number | null
  fatG: number | null
  ingredients: RecipeIngredient[]
  steps: string[]
  tips: string | null
  /** Where the idea came from (a credit link), if anywhere. */
  sourceName: string | null
  sourceUrl: string | null
  /** Photo: see recipePhoto(). */
  imageKey: string | null
  createdBy: number
  archived: boolean
  /** Saved by the signed-in person. */
  saved: boolean
  updatedAt: string
}

/** The most servings a recipe makes, and the most you can scale it to. */
export const MAX_RECIPE_SERVINGS = 12

const ingredientInput = z.object({
  amount: z.number().positive().max(10000).nullable(),
  unit: z.string().trim().min(1).max(20).nullable(),
  name: z.string().trim().min(1, 'Every ingredient needs a name').max(100),
})

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null)

export const recipeInput = z.object({
  title: z.string().trim().min(2, 'Give it a name').max(80),
  summary: optionalText(300),
  meal: z.enum(MEALS),
  category: z.enum(RECIPE_CATEGORIES).default('meal'),
  servings: z.number().int().min(1).max(MAX_RECIPE_SERVINGS),
  prepMinutes: z.number().int().min(0).max(600),
  cookMinutes: z.number().int().min(0).max(600),
  kcal: z.number().min(0).max(3000),
  proteinG: z.number().min(0).max(300),
  carbsG: z.number().min(0).max(500).nullable(),
  fatG: z.number().min(0).max(300).nullable(),
  ingredients: z.array(ingredientInput).min(1, 'Add at least one ingredient').max(40),
  steps: z.array(z.string().trim().min(1).max(600)).min(1, 'Add at least one step').max(30),
  tips: optionalText(600),
  sourceName: optionalText(80),
  sourceUrl: z
    .union([
      z.literal(''),
      z.url({ protocol: /^https$/, message: 'Use a full https:// link' }).max(300),
    ])
    .nullish()
    .transform((v) => v || null),
})
export type RecipeInput = z.input<typeof recipeInput>

/**
 * A page of recipes: GET /recipes?page=&pageSize=&q=&category=&meal=&saved=1&adult=1&sort=
 * (staff: &archived=1). adult = leave toddler recipes out (the app's "All").
 */
export const recipeListQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_RECIPE_PAGE_SIZE).default(RECIPE_PAGE_SIZE),
  q: z.string().trim().max(80).optional(),
  category: z.enum(RECIPE_CATEGORIES).optional(),
  meal: z.enum(MEALS).optional(),
  saved: z.literal('1').optional(),
  adult: z.literal('1').optional(),
  archived: z.literal('1').optional(),
  sort: z.enum(RECIPE_SORTS).default('name'),
})
export type RecipeListQuery = z.input<typeof recipeListQuery>

/** How many recipes match the search in each chip (before the chip itself is applied). */
export interface RecipeCounts {
  /** Everything except toddler recipes. */
  adult: number
  saved: number
  category: Record<RecipeCategory, number>
  /** Adult recipes per meal. */
  meal: Record<Meal, number>
}

export interface RecipePage {
  recipes: Recipe[]
  total: number
  page: number
  pageSize: number
  counts: RecipeCounts
}

/** Search words as SQL LIKE patterns: lower-case, plural s dropped, % and _ taken literally. */
export function recipeSearchWords(q: string | undefined): string[] {
  return (q ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((w) => w.replace(/s$/, '').replace(/[%_\\]/g, (c) => `\\${c}`))
    .filter(Boolean)
}

/** Units read off the front of an ingredient line, as written and as shown. */
const UNITS: Record<string, string> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'L',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  cup: 'cup',
  cups: 'cup',
  slice: 'slice',
  slices: 'slice',
  clove: 'clove',
  cloves: 'clove',
  can: 'can',
  cans: 'can',
  tin: 'tin',
  tins: 'tin',
  pinch: 'pinch',
  handful: 'handful',
  handfuls: 'handful',
}

/** Words that grow an s when there's more than one. */
const COUNTED_UNITS = new Set(['cup', 'slice', 'clove', 'can', 'tin', 'handful'])

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 }

/** "1½", "1 1/2", "1/2", "1.5", "1,5" → 1.5. Null when it isn't a number. */
function readAmount(text: string): number | null {
  const t = text.replace(',', '.')
  const mixed = /^(\d+)\s*([½¼¾⅓⅔])$/.exec(t) ?? /^()([½¼¾⅓⅔])$/.exec(t)
  if (mixed) return Number(mixed[1] || 0) + (FRACTIONS[mixed[2] ?? ''] ?? 0)
  const slash = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(t)
  if (slash) {
    const den = Number(slash[3])
    return den ? Number(slash[1] ?? 0) + Number(slash[2]) / den : null
  }
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null
}

/**
 * Reads one typed line: "200 g chicken breast", "2 eggs", "1/2 cup rice", "200g mince",
 * "salt and pepper". Returns null for an empty line.
 */
export function parseIngredientLine(line: string): RecipeIngredient | null {
  const text = line.trim().replace(/^[-•*]\s*/, '')
  if (!text) return null
  const match = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\s*[½¼¾⅓⅔]|[½¼¾⅓⅔]|\d+(?:[.,]\d+)?)\s*(.*)$/.exec(
    text,
  )
  const amount = match ? readAmount((match[1] ?? '').trim()) : null
  if (!match || amount === null || amount <= 0) return { amount: null, unit: null, name: text }
  const rest = (match[2] ?? '').trim()
  const [first = '', ...others] = rest.split(/\s+/)
  const unit = UNITS[first.toLowerCase().replace(/\.$/, '')]
  if (unit && others.length > 0) return { amount, unit, name: others.join(' ') }
  return { amount, unit: null, name: rest || text }
}

/** Every line of a text box, one ingredient each (blank lines skipped). */
export const parseIngredientLines = (text: string): RecipeIngredient[] =>
  text
    .split('\n')
    .map(parseIngredientLine)
    .filter((i): i is RecipeIngredient => i !== null)

/** One step per line (blank lines skipped, "1." or "-" in front dropped). */
export const parseStepLines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) =>
      l
        .trim()
        .replace(/^(\d+[.)]|[-•*])\s*/, '')
        .trim(),
    )
    .filter(Boolean)

const NICE_FRACTIONS: Array<[number, string]> = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
]

/**
 * An amount as a person would write it. Grams and ml over 20 round to 5 (a scaled 233 g is
 * 235 g); small counts use halves and quarters (1½ eggs, ¾ cup); the rest one decimal at most.
 */
export function formatAmount(amount: number, unit: string | null = null): string {
  if (unit === 'g' || unit === 'ml') {
    if (amount >= 20) return String(Math.round(amount / 5) * 5)
    return String(Math.round(amount))
  }
  const whole = Math.floor(amount)
  const part = amount - whole
  if (part < 0.08) return String(whole || Math.round(amount * 10) / 10)
  if (part > 0.92) return String(whole + 1)
  if (amount < 10) {
    const nice = NICE_FRACTIONS.find(([v]) => Math.abs(part - v) < 0.06)
    if (nice) return `${whole || ''}${nice[1]}`
  }
  return String(Math.round(amount * 10) / 10)
}

/** "200 g chicken breast", "1½ cups rice", "2 eggs", "salt and pepper", scaled by `factor`. */
export function ingredientLabel(i: RecipeIngredient, factor = 1): string {
  if (i.amount === null) return i.name
  const amount = i.amount * factor
  const shown = formatAmount(amount, i.unit)
  if (!i.unit) return `${shown} ${i.name}`
  const unit = COUNTED_UNITS.has(i.unit) && amount > 1.08 ? `${i.unit}s` : i.unit
  return `${shown} ${unit} ${i.name}`
}

/** Back to the line a coach typed, for editing. */
export const ingredientLine = (i: RecipeIngredient) =>
  i.amount === null
    ? i.name
    : `${formatAmount(i.amount)}${i.unit ? ` ${i.unit}` : ''} ${i.name}`.trim()

/** Share of calories that comes from protein (4 kcal a gram), 0–100. Null with no calories. */
export function proteinShare(kcal: number, proteinG: number): number | null {
  if (kcal <= 0) return null
  return Math.min(100, Math.round(((proteinG * 4) / kcal) * 100))
}

/** "25 min", "1 h 10 min". */
export function minutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** Search by name, summary and ingredients: every word must appear ("chicken rice"). */
export function matchesRecipe(
  r: Pick<Recipe, 'title' | 'summary' | 'ingredients'>,
  query: string,
): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack =
    `${r.title} ${r.summary ?? ''} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase()
  return words.every((w) => haystack.includes(w.replace(/s$/, '')))
}

/** What one logged portion adds up to: `servings` portions of a recipe. */
export function recipePortion(
  r: Pick<Recipe, 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>,
  servings: number,
) {
  const times = (n: number | null) => (n === null ? null : Math.round(n * servings * 10) / 10)
  return {
    kcal: Math.round(r.kcal * servings),
    proteinG: Math.round(r.proteinG * servings * 10) / 10,
    carbsG: times(r.carbsG),
    fatG: times(r.fatG),
  }
}

/**
 * A recipe's photo URL, or null. Unsplash photos are shown from Unsplash. Bundled photos live in the phone app
 * (apps/app/public/recipe-images), so the admin passes APP_URL as `base`; coaches' uploads
 * are served by the API in both apps. 'none' = removed on purpose.
 */
export function recipePhoto(imageKey: string | null | undefined, base = ''): string | null {
  if (!imageKey) return null
  if (imageKey.startsWith('recipe-images/')) return `${base.replace(/\/$/, '')}/${imageKey}`
  // A free Unsplash photo, shown from Unsplash's own image server (sized for the app).
  if (imageKey.startsWith('https://images.unsplash.com/'))
    return `${imageKey}?w=1200&q=75&auto=format&fit=crop`
  if (imageKey.startsWith('uploads/')) return `/api/media/${imageKey.split(':')[0]}/0`
  return null
}
