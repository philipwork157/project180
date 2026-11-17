// Recipes the coaches put together, shared by everyone who signs in to the phone app, and the
// ones each person saved. Archived (archived_at), not deleted, unless the coach deletes for good:
// nothing points at a recipe (a logged serving copies its name and numbers into food_entries).
import { MEALS, RECIPE_CATEGORIES, type RecipeIngredient } from '@project180/shared'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './auth'
import { businesses } from './businesses'
import { createdAt, id, timestamp, updatedAt } from './columns'

export const recipes = sqliteTable(
  'recipes',
  {
    id: id(),
    title: text('title').notNull(),
    summary: text('summary'),
    meal: text('meal', { enum: MEALS }).notNull(),
    // Meals, smoothies, pre/post-workout, snacks, protein baking, toddler (kept apart in the app).
    category: text('category', { enum: RECIPE_CATEGORIES }).notNull().default('meal'),
    servings: integer('servings').notNull(),
    prepMinutes: integer('prep_minutes').notNull().default(0),
    cookMinutes: integer('cook_minutes').notNull().default(0),
    // Per serving.
    kcal: real('kcal').notNull(),
    proteinG: real('protein_g').notNull(),
    carbsG: real('carbs_g'),
    fatG: real('fat_g'),
    // Small lists always read whole with the recipe (never filtered in SQL).
    ingredients: text('ingredients', { mode: 'json' }).notNull().$type<RecipeIngredient[]>(),
    steps: text('steps', { mode: 'json' }).notNull().$type<string[]>(),
    tips: text('tips'),
    // A credit for where the idea came from.
    sourceName: text('source_name'),
    sourceUrl: text('source_url'),
    // Photo: a bundled one (`recipe-images/<file>`), a coach's upload (`uploads/recipes/…:1`),
    // or 'none' when removed on purpose (so the seed never puts one back). Null = none yet.
    imageKey: text('image_key'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    // Each business has its own recipes; only its staff and clients see these rows.
    businessId: integer('business_id').references(() => businesses.id),
    archivedAt: timestamp('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('recipes_created_by_idx').on(t.createdBy),
    index('recipes_business_idx').on(t.businessId),
    // Lists read active (or archived) recipes in name order.
    index('recipes_archived_title_idx').on(t.archivedAt, t.title),
    // The app's chips page through one category at a time.
    index('recipes_archived_category_title_idx').on(t.archivedAt, t.category, t.title),
  ],
)

/** Recipes someone saved (the heart). One row per person and recipe. */
export const recipeSaves = sqliteTable(
  'recipe_saves',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipeId: integer('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('recipe_saves_user_recipe_uq').on(t.userId, t.recipeId),
    index('recipe_saves_recipe_idx').on(t.recipeId),
  ],
)
