// Recipes. Everyone signed in reads the active recipes and saves their own favourites; staff
// add, edit, archive and delete them (only the one who made it, or an owner, can change it).
import { type Db, recipeSaves, recipes } from '@project180/db'
import {
  isStaff,
  MEALS,
  type Me,
  RECIPE_CATEGORIES,
  type Recipe,
  type RecipeCounts,
  type RecipePage,
  recipeInput,
  recipeListQuery,
  recipeSearchWords,
} from '@project180/shared'
import { and, asc, count, desc, eq, isNotNull, isNull, ne, type SQL, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId, parseQuery } from '../errors'
import { assertCanEdit, inMyBusiness } from '../library'
import { deletePhotos, saveUploads } from '../media'
import { requireAdmin, requireUser } from '../middleware'

type RecipeRow = typeof recipes.$inferSelect

function toRecipe(r: RecipeRow, saved: boolean): Recipe {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    meal: r.meal,
    category: r.category,
    servings: r.servings,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    kcal: r.kcal,
    proteinG: r.proteinG,
    carbsG: r.carbsG,
    fatG: r.fatG,
    ingredients: r.ingredients,
    steps: r.steps,
    tips: r.tips,
    sourceName: r.sourceName,
    sourceUrl: r.sourceUrl,
    imageKey: r.imageKey,
    createdBy: r.createdBy,
    archived: r.archivedAt !== null,
    saved,
    updatedAt: r.updatedAt.toISOString(),
  }
}

/**
 * Only its creator or an owner may change a recipe. findRecipe only ever finds recipes in the
 * person's own business, so the recipe's business is theirs.
 */
function assertCanEditRecipe(user: Me, recipe: Recipe) {
  assertCanEdit(user, { createdBy: recipe.createdBy, businessId: user.businessId })
}

/** Recipes with whether this person saved each (one query, a join on their own saves). */
async function loadRecipes(db: Db, user: Me, where: SQL | undefined): Promise<Recipe[]> {
  const rows = await db
    .select({ recipe: recipes, savedBy: recipeSaves.userId })
    .from(recipes)
    .leftJoin(
      recipeSaves,
      and(eq(recipeSaves.recipeId, recipes.id), eq(recipeSaves.userId, user.id)),
    )
    .where(where)
    .orderBy(asc(recipes.title), asc(recipes.id))
  return rows.map((r) => toRecipe(r.recipe, r.savedBy !== null))
}

/**
 * One recipe this person may see: their own business's, active for everyone, archived too for
 * staff. 404 otherwise.
 */
async function findRecipe(db: Db, user: Me, id: number): Promise<Recipe> {
  const [recipe] = await loadRecipes(
    db,
    user,
    and(
      eq(recipes.id, id),
      inMyBusiness(recipes.businessId, user),
      isStaff(user.role) ? undefined : isNull(recipes.archivedAt),
    ),
  )
  if (!recipe) notFound('Recipe not found')
  return recipe
}

const SORT_ORDER = {
  name: [asc(recipes.title), asc(recipes.id)],
  protein: [desc(recipes.proteinG), asc(recipes.title)],
  quickest: [asc(sql`${recipes.prepMinutes} + ${recipes.cookMinutes}`), asc(recipes.title)],
  lightest: [asc(recipes.kcal), asc(recipes.title)],
} as const

/** Every search word must appear in the name, summary, ingredients or meal. */
function searchWhere(q: string | undefined): SQL | undefined {
  const words = recipeSearchWords(q)
  if (words.length === 0) return undefined
  const haystack = sql`lower(${recipes.title} || ' ' || coalesce(${recipes.summary}, '') || ' ' || ${recipes.ingredients} || ' ' || ${recipes.meal})`
  return and(...words.map((w) => sql`${haystack} like ${`%${w}%`} escape '\\'`))
}

async function listRecipes(
  db: Db,
  user: Me,
  query: ReturnType<typeof recipeListQuery.parse>,
): Promise<RecipePage> {
  const archived = query.archived === '1' && isStaff(user.role)
  // What every count shares: their business's active (or archived) recipes matching the search.
  const base = and(
    inMyBusiness(recipes.businessId, user),
    archived ? isNotNull(recipes.archivedAt) : isNull(recipes.archivedAt),
    searchWhere(query.q),
  )
  const adult = ne(recipes.category, 'toddler')
  const savedJoin = and(eq(recipeSaves.recipeId, recipes.id), eq(recipeSaves.userId, user.id))
  const where = and(
    base,
    query.category ? eq(recipes.category, query.category) : undefined,
    query.adult === '1' && !query.category ? adult : undefined,
    query.meal ? eq(recipes.meal, query.meal) : undefined,
    query.saved === '1' ? isNotNull(recipeSaves.userId) : undefined,
  )
  const offset = (query.page - 1) * query.pageSize
  const [rows, [total], byCategory, byMeal, [saved]] = await Promise.all([
    db
      .select({ recipe: recipes, savedBy: recipeSaves.userId })
      .from(recipes)
      .leftJoin(recipeSaves, savedJoin)
      .where(where)
      .orderBy(...SORT_ORDER[query.sort])
      .limit(query.pageSize)
      .offset(offset),
    db.select({ n: count() }).from(recipes).leftJoin(recipeSaves, savedJoin).where(where),
    db
      .select({ category: recipes.category, n: count() })
      .from(recipes)
      .where(base)
      .groupBy(recipes.category),
    db
      .select({ meal: recipes.meal, n: count() })
      .from(recipes)
      .where(and(base, adult))
      .groupBy(recipes.meal),
    db.select({ n: count() }).from(recipes).innerJoin(recipeSaves, savedJoin).where(base),
  ])
  const category = Object.fromEntries(
    RECIPE_CATEGORIES.map((k) => [k, 0]),
  ) as RecipeCounts['category']
  for (const r of byCategory) category[r.category] = r.n
  const meal = Object.fromEntries(MEALS.map((k) => [k, 0])) as RecipeCounts['meal']
  for (const r of byMeal) meal[r.meal] = r.n
  return {
    recipes: rows.map((r) => toRecipe(r.recipe, r.savedBy !== null)),
    total: total?.n ?? 0,
    page: query.page,
    pageSize: query.pageSize,
    counts: {
      adult: Object.values(category).reduce((a, n) => a + n, 0) - category.toddler,
      saved: saved?.n ?? 0,
      category,
      meal,
    },
  }
}

export const recipeRoutes = new Hono<AppEnv>()
  .use(requireUser)
  /**
   * A page of recipes, with the counts for each chip. Search, chips and sort run in SQL, so
   * the list stays quick however many recipes there are. Staff: ?archived=1 for archived ones.
   */
  .get('/', async (c) => {
    const { db, user } = c.var
    const query = parseQuery(recipeListQuery, c.req.query())
    return c.json(await listRecipes(db, user, query))
  })
  .get('/:id', async (c) => {
    const { db, user } = c.var
    return c.json({ recipe: await findRecipe(db, user, parseId(c.req.param('id'))) })
  })
  /** Save (the heart). Only ever the signed-in person's own saves. */
  .put('/:id/save', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const recipe = await findRecipe(db, user, id)
    await db.insert(recipeSaves).values({ userId: user.id, recipeId: id }).onConflictDoNothing()
    return c.json({ recipe: { ...recipe, saved: true } })
  })
  .delete('/:id/save', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const recipe = await findRecipe(db, user, id)
    await db
      .delete(recipeSaves)
      .where(and(eq(recipeSaves.userId, user.id), eq(recipeSaves.recipeId, id)))
    return c.json({ recipe: { ...recipe, saved: false } })
  })
  .post('/', requireAdmin, async (c) => {
    const input = await parseBody(c.req.raw, recipeInput)
    const [row] = await c.var.db
      .insert(recipes)
      .values({ ...input, createdBy: c.var.user.id, businessId: c.var.user.businessId })
      .returning()
    if (!row) throw new Error('Insert returned no row')
    return c.json({ recipe: toRecipe(row, false) }, 201)
  })
  .put('/:id', requireAdmin, async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    assertCanEditRecipe(user, await findRecipe(db, user, id))
    const input = await parseBody(c.req.raw, recipeInput)
    await db.update(recipes).set(input).where(eq(recipes.id, id))
    return c.json({ recipe: await findRecipe(db, user, id) })
  })
  /** Archive: hidden from the phone app, kept for later. */
  .post('/:id/archive', requireAdmin, async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    assertCanEditRecipe(user, await findRecipe(db, user, id))
    await db.update(recipes).set({ archivedAt: new Date() }).where(eq(recipes.id, id))
    return c.json({ recipe: await findRecipe(db, user, id) })
  })
  .post('/:id/restore', requireAdmin, async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    assertCanEditRecipe(user, await findRecipe(db, user, id))
    await db.update(recipes).set({ archivedAt: null }).where(eq(recipes.id, id))
    return c.json({ recipe: await findRecipe(db, user, id) })
  })
  /** A coach's own photo (replaces a stock one). Shrunk in the browser first. */
  .post('/:id/photo', requireAdmin, async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const existing = await findRecipe(db, user, id)
    assertCanEditRecipe(user, existing)
    const body = await c.req.parseBody()
    if (!(body.photo instanceof File) || body.photo.size === 0)
      throw new HTTPException(400, { message: 'Choose a photo' })
    const imageKey = await saveUploads(c.env, `recipes/${id}`, [body.photo])
    await deletePhotos(c.env, existing.imageKey)
    await db.update(recipes).set({ imageKey }).where(eq(recipes.id, id))
    return c.json({ recipe: { ...existing, imageKey } })
  })
  /** Remove the photo. `none` (not empty) so the seed never puts a stock photo back. */
  .delete('/:id/photo', requireAdmin, async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const existing = await findRecipe(db, user, id)
    assertCanEditRecipe(user, existing)
    await deletePhotos(c.env, existing.imageKey)
    await db.update(recipes).set({ imageKey: 'none' }).where(eq(recipes.id, id))
    return c.json({ recipe: { ...existing, imageKey: 'none' } })
  })
  /** Delete for good. Nothing points at a recipe; people's saves go with it. */
  .delete('/:id', requireAdmin, async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const existing = await findRecipe(db, user, id)
    assertCanEditRecipe(user, existing)
    await db.delete(recipes).where(eq(recipes.id, id))
    await deletePhotos(c.env, existing.imageKey)
    return c.body(null, 204)
  })
