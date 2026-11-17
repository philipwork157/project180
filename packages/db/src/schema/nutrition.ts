// What each person eats and drinks (food log, daily targets, water, the photo counter) and the
// exercise they log by hand to add to the day (activities, steps).
// Photos themselves are never stored.
import {
  ACTIVITY_KINDS,
  FOOD_SOURCES,
  type FoodSearchResult,
  MEALS,
  type SavedMealItem,
} from '@project180/shared'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './auth'
import { createdAt, id, timestamp, updatedAt } from './columns'

const userId = () =>
  integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })

/** One food someone logged. client_uuid is made on the phone so a retry never saves twice. */
export const foodEntries = sqliteTable(
  'food_entries',
  {
    id: id(),
    clientUuid: text('client_uuid').notNull().unique(),
    userId: userId(),
    // Their local day, as YYYY-MM-DD.
    date: text('date').notNull(),
    meal: text('meal', { enum: MEALS }).notNull(),
    name: text('name').notNull(),
    grams: real('grams'),
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull(),
    carbsG: real('carbs_g'),
    fatG: real('fat_g'),
    // Optional extras (from barcodes, the food database or typed in).
    fibreG: real('fibre_g'),
    sugarG: real('sugar_g'),
    sodiumMg: real('sodium_mg'),
    source: text('source', { enum: FOOD_SOURCES }).notNull().default('manual'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // A day, a range of days and "Recent" all read one person's rows by date.
  (t) => [index('food_entries_user_date_idx').on(t.userId, t.date)],
)

/** A client's daily targets, set by their coach. One row per person. */
export const nutritionTargets = sqliteTable(
  'nutrition_targets',
  {
    id: id(),
    userId: userId(),
    kcal: integer('kcal').notNull(),
    proteinG: integer('protein_g').notNull(),
    carbsG: integer('carbs_g'),
    fatG: integer('fat_g'),
    // The weight the calculator used; the Food card suggests recalculating when they move 2 kg.
    basisWeightKg: real('basis_weight_kg'),
    setBy: integer('set_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('nutrition_targets_user_uq').on(t.userId),
    // Deleting a coach clears who set what.
    index('nutrition_targets_set_by_idx').on(t.setBy),
  ],
)

/**
 * Water someone drank: one row per tap (+250 ml), so Undo removes the last one. The daily goal
 * is users.water_goal_ml. client_uuid is made on the phone so a retry never saves twice.
 */
export const waterLogs = sqliteTable(
  'water_logs',
  {
    id: id(),
    clientUuid: text('client_uuid').notNull().unique(),
    userId: userId(),
    // Their local day, as YYYY-MM-DD.
    date: text('date').notNull(),
    ml: integer('ml').notNull(),
    createdAt: createdAt(),
  },
  // A day and a range of days read one person's rows by date.
  (t) => [index('water_logs_user_date_idx').on(t.userId, t.date)],
)

/** Photo estimates used per person per day (their local day): the daily cap. */
export const foodPhotoUses = sqliteTable(
  'food_photo_uses',
  {
    userId: userId(),
    date: text('date').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [uniqueIndex('food_photo_uses_user_date_uq').on(t.userId, t.date)],
)

/**
 * Products looked up by barcode, saved so each barcode is fetched from a provider once (their
 * rate limits are low). Kept apart from what people log: some providers' data comes with its
 * own licence (Open Food Facts: ODbL). found = false remembers a miss for a while.
 */
export const foodProducts = sqliteTable(
  'food_products',
  {
    id: id(),
    barcode: text('barcode').notNull(),
    found: integer('found', { mode: 'boolean' }).notNull(),
    provider: text('provider'),
    name: text('name'),
    brand: text('brand'),
    kcal: real('kcal'),
    proteinG: real('protein_g'),
    carbsG: real('carbs_g'),
    fatG: real('fat_g'),
    fibreG: real('fibre_g'),
    sugarG: real('sugar_g'),
    sodiumMg: real('sodium_mg'),
    servingG: real('serving_g'),
    fetchedAt: timestamp('fetched_at').notNull(),
  },
  (t) => [uniqueIndex('food_products_barcode_uq').on(t.barcode)],
)

/**
 * Name searches ("egg"), saved so the same search is sent to the providers at most once a week
 * (Open Food Facts limits searches per IP address). `query` is the providers asked and the
 * search as typed, lower case: "openfoodfacts|egg". The results are always read whole.
 */
export const foodSearches = sqliteTable('food_searches', {
  query: text('query').primaryKey(),
  results: text('results', { mode: 'json' }).notNull().$type<FoodSearchResult[]>(),
  fetchedAt: timestamp('fetched_at').notNull(),
})

/**
 * Activity logged by hand on Fuel ("Add activity": a walk, padel...). kcal is the estimate
 * saved when it was logged (from their weight that day), like a food's kcal.
 */
export const activityLogs = sqliteTable(
  'activity_logs',
  {
    id: id(),
    clientUuid: text('client_uuid').notNull().unique(),
    userId: userId(),
    // Their local day, as YYYY-MM-DD.
    date: text('date').notNull(),
    kind: text('kind', { enum: ACTIVITY_KINDS }).notNull(),
    minutes: integer('minutes').notNull(),
    kcal: integer('kcal').notNull(),
    createdAt: createdAt(),
  },
  // A day and a range of days read one person's rows by date.
  (t) => [index('activity_logs_user_date_idx').on(t.userId, t.date)],
)

/** Steps typed in for a day: one row per person per day. */
export const stepLogs = sqliteTable(
  'step_logs',
  {
    userId: userId(),
    date: text('date').notNull(),
    steps: integer('steps').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('step_logs_user_date_uq').on(t.userId, t.date)],
)

/**
 * A meal someone saved to log again in one tap ("My meals"). Its foods are read and written
 * whole with it, so they live in one small JSON value.
 */
export const savedMeals = sqliteTable(
  'saved_meals',
  {
    id: id(),
    userId: userId(),
    name: text('name').notNull(),
    items: text('items', { mode: 'json' }).$type<SavedMealItem[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('saved_meals_user_idx').on(t.userId)],
)
