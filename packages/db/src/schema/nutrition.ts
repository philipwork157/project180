// What each person eats: their food log, their coach's daily targets, and the daily
// photo-estimate counter. Photos themselves are never stored.
import { FOOD_SOURCES, MEALS } from '@project180/shared'
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
    servingG: real('serving_g'),
    fetchedAt: timestamp('fetched_at').notNull(),
  },
  (t) => [uniqueIndex('food_products_barcode_uq').on(t.barcode)],
)
