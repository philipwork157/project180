// Food log routes. meFoodRoutes is mounted inside meRoutes (/me/food) and adminFoodRoutes inside
// adminUserRoutes (/admin/users/:id/…), so each runs behind its parent's sign-in checks once.
import {
  activityLogs,
  clientProfiles,
  type Db,
  foodEntries,
  foodFavourites,
  foodPhotoUses,
  nutritionTargets,
  savedMeals,
  stepLogs,
  users,
} from '@project180/db'
import {
  activityInput,
  activityKcal,
  addDays,
  addFoodInput,
  type BarcodeProduct,
  barcodeInput,
  copyMealInput,
  type FavouriteFood,
  type FoodDay,
  type FoodEntry,
  type FoodPhotoDraft,
  type FoodSearchResult,
  type FoodSetup,
  type FoodSummary,
  favouriteInput,
  foodDescribeInput,
  foodPhotoHint,
  foodSearchInput,
  foodStreak,
  isoDate,
  logSavedMealInput,
  MAX_FAVOURITES,
  MAX_SAVED_MEAL_ITEMS,
  MAX_SAVED_MEALS,
  type Me,
  type NutritionTargets,
  noBurn,
  nutritionTargetsInput,
  type PhotoLimit,
  photoLimitInput,
  RECENT_FOOD_DAYS,
  type RecentFood,
  roundGrams,
  roundKcal,
  type SavedMeal,
  type SavedMealItem,
  saveMealInput,
  stepsInput,
  sumExtras,
  sumMacros,
  todayIn,
  updateFoodInput,
} from '@project180/shared'
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { canCoach, managedPerson, type Person } from '../access'
import { barcodeProviders, lookupBarcode } from '../barcode'
import { searchFoods, searchProviders } from '../barcode/search'
import { insertMany, runAll } from '../batch'
import { loadBurn, weightOn } from '../burn'
import { type ClaudeMeter, recordClaudeCall } from '../claude-calls'
import type { AppEnv, Bindings } from '../env'
import { conflict, notFound, parseBody, parseId, parseQuery } from '../errors'
import {
  claimPhoto,
  estimateFoodPhoto,
  estimateFoodText,
  foodPhotosConfigured,
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  releasePhoto,
} from '../food-photo'
import { latestWeight, savePlanSettings, weighInToday } from '../profiles'
import { withinLimit } from '../rate-limit'
import { claudeFeature, foodPhotoSettings, foodPhotosAvailable, photoLimitFor } from '../settings'

/** The longest range one summary may cover (a quarter). */
const MAX_RANGE_DAYS = 92
/** Rows read for "Recent" before keeping the newest of each name. */
const RECENT_SCAN = 200
const RECENT_KEEP = 20

const entryColumns = {
  id: foodEntries.id,
  clientUuid: foodEntries.clientUuid,
  date: foodEntries.date,
  meal: foodEntries.meal,
  name: foodEntries.name,
  grams: foodEntries.grams,
  kcal: foodEntries.kcal,
  proteinG: foodEntries.proteinG,
  carbsG: foodEntries.carbsG,
  fatG: foodEntries.fatG,
  fibreG: foodEntries.fibreG,
  sugarG: foodEntries.sugarG,
  sodiumMg: foodEntries.sodiumMg,
  source: foodEntries.source,
  createdAt: foodEntries.createdAt,
}

type EntryRow = { createdAt: Date } & Omit<FoodEntry, 'createdAt'>

const toEntry = (row: EntryRow): FoodEntry => ({ ...row, createdAt: row.createdAt.toISOString() })

const dayQuery = z.object({ date: isoDate.optional() })
const rangeQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((r) => r.from <= r.to, 'from must be on or before to')
  .refine((r) => addDays(r.from, MAX_RANGE_DAYS - 1) >= r.to, `At most ${MAX_RANGE_DAYS} days`)

export async function loadTargets(db: Db, userId: number): Promise<NutritionTargets | null> {
  const [row] = await db
    .select({
      kcal: nutritionTargets.kcal,
      proteinG: nutritionTargets.proteinG,
      carbsG: nutritionTargets.carbsG,
      fatG: nutritionTargets.fatG,
      basisWeightKg: nutritionTargets.basisWeightKg,
      goalWeightKg: clientProfiles.goalWeightKg,
      weeklyChangeKg: clientProfiles.weeklyChangeKg,
      updatedAt: nutritionTargets.updatedAt,
    })
    .from(nutritionTargets)
    .leftJoin(clientProfiles, eq(clientProfiles.userId, nutritionTargets.userId))
    .where(eq(nutritionTargets.userId, userId))
  return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null
}

type Who = { id: number; timezone: string }

/**
 * One person's day: every food in the order logged, the totals, their targets and what they
 * burned (added to the day's calories). Workouts only when `withWorkouts` (see loadBurn).
 */
export async function loadFoodDay(
  db: Db,
  person: Who,
  date: string,
  withWorkouts = true,
): Promise<FoodDay> {
  const userId = person.id
  const [rows, targets, burn] = await Promise.all([
    db
      .select(entryColumns)
      .from(foodEntries)
      .where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, date)))
      .orderBy(asc(foodEntries.createdAt), asc(foodEntries.id)),
    loadTargets(db, userId),
    loadBurn(db, person, date, date, withWorkouts),
  ])
  const entries = rows.map(toEntry)
  return {
    date,
    entries,
    totals: sumMacros(entries),
    extras: sumExtras(entries),
    targets,
    burned: burn.get(date) ?? noBurn(),
  }
}

/** Totals per day over a range, added up in SQL (only days with food are listed). */
export async function loadFoodSummary(
  db: Db,
  person: Who,
  from: string,
  to: string,
  withWorkouts = true,
): Promise<FoodSummary> {
  const userId = person.id
  const [rows, targets, burn] = await Promise.all([
    db
      .select({
        date: foodEntries.date,
        kcal: sql<number>`coalesce(sum(${foodEntries.kcal}), 0)`,
        proteinG: sql<number>`coalesce(sum(${foodEntries.proteinG}), 0)`,
        carbsG: sql<number>`coalesce(sum(${foodEntries.carbsG}), 0)`,
        fatG: sql<number>`coalesce(sum(${foodEntries.fatG}), 0)`,
        entries: count(),
      })
      .from(foodEntries)
      .where(
        and(eq(foodEntries.userId, userId), gte(foodEntries.date, from), lte(foodEntries.date, to)),
      )
      .groupBy(foodEntries.date)
      .orderBy(asc(foodEntries.date)),
    loadTargets(db, userId),
    loadBurn(db, person, from, to, withWorkouts),
  ])
  return {
    from,
    to,
    targets,
    burned: [...burn]
      .filter(([, b]) => b.kcal > 0)
      .map(([date, b]) => ({ date, kcal: b.kcal }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    days: rows.map((r) => ({
      date: r.date,
      entries: r.entries,
      kcal: roundKcal(Number(r.kcal)),
      proteinG: roundGrams(Number(r.proteinG)),
      carbsG: roundGrams(Number(r.carbsG)),
      fatG: roundGrams(Number(r.fatG)),
    })),
  }
}

/** How far back a streak is counted. */
const STREAK_DAYS = 400

const toSavedMeal = (row: typeof savedMeals.$inferSelect): SavedMeal => {
  const totals = sumMacros(row.items)
  return {
    id: row.id,
    name: row.name,
    items: row.items,
    kcal: totals.kcal,
    proteinG: totals.proteinG,
  }
}

/**
 * Logs several foods at once (a copied or saved meal). Each food's id comes from the request's
 * id plus its place, so a retry finds them already saved and adds nothing.
 */
async function logItems(
  db: Db,
  userId: number,
  to: { clientUuid: string; date: string; meal: FoodEntry['meal'] },
  items: SavedMealItem[],
) {
  const uuids = items.map((_, i) => `${to.clientUuid}:${i}`)
  const existing = await db
    .select({ clientUuid: foodEntries.clientUuid, userId: foodEntries.userId })
    .from(foodEntries)
    .where(inArray(foodEntries.clientUuid, uuids))
  if (existing.some((e) => e.userId !== userId)) conflict('Food id in use')
  const saved = new Set(existing.map((e) => e.clientUuid))
  const rows = items
    .map((f, i) => ({
      clientUuid: uuids[i] as string,
      userId,
      date: to.date,
      meal: to.meal,
      name: f.name,
      grams: f.grams,
      kcal: f.kcal,
      proteinG: f.proteinG,
      carbsG: f.carbsG,
      fatG: f.fatG,
      fibreG: f.fibreG ?? null,
      sugarG: f.sugarG ?? null,
      sodiumMg: f.sodiumMg ?? null,
      source: f.source,
    }))
    .filter((r) => !saved.has(r.clientUuid))
  await runAll(db, insertMany(db, foodEntries, rows))
}

/** Exercise can be logged for today and earlier, never ahead. */
function notInFuture(date: string, timezone: string) {
  if (date > todayIn(timezone))
    throw new HTTPException(400, { message: 'That day hasn’t happened yet.' })
}

/** Foods logged in the last weeks, newest first, one per name. */
async function recentFoods(db: Db, userId: number, today: string): Promise<RecentFood[]> {
  const rows = await db
    .select({
      name: foodEntries.name,
      grams: foodEntries.grams,
      kcal: foodEntries.kcal,
      proteinG: foodEntries.proteinG,
      carbsG: foodEntries.carbsG,
      fatG: foodEntries.fatG,
      fibreG: foodEntries.fibreG,
      sugarG: foodEntries.sugarG,
      sodiumMg: foodEntries.sodiumMg,
    })
    .from(foodEntries)
    .where(
      and(eq(foodEntries.userId, userId), gte(foodEntries.date, addDays(today, -RECENT_FOOD_DAYS))),
    )
    .orderBy(desc(foodEntries.date), desc(foodEntries.id))
    .limit(RECENT_SCAN)
  const seen = new Set<string>()
  const foods: RecentFood[] = []
  for (const r of rows) {
    const key = r.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    foods.push(r)
    if (foods.length === RECENT_KEEP) break
  }
  return foods
}

/** The signed-in person's own food log. Only ever their own rows (c.var.user.id). */
export const meFoodRoutes = new Hono<AppEnv>()
  /** Can this person estimate food from photos here, and how many a day? */
  .get('/setup', async (c) => {
    const [available, perDay] = await Promise.all([
      foodPhotosAvailable(c.var.db, c.env),
      photoLimitFor(c.var.db, c.env, c.var.user),
    ])
    return c.json<FoodSetup>({
      photos: available && perDay > 0,
      photosPerDay: perDay,
      barcode: barcodeProviders(c.env).length > 0,
      search: searchProviders(c.env).length > 0,
    })
  })
  /** One day (today when no ?date). */
  .get('/', async (c) => {
    const { db, user } = c.var
    const { date } = parseQuery(dayQuery, { date: c.req.query('date') })
    return c.json({ day: await loadFoodDay(db, user, date ?? todayIn(user.timezone)) })
  })
  .get('/summary', async (c) => {
    const { db, user } = c.var
    const { from, to } = parseQuery(rangeQuery, c.req.query())
    return c.json({ summary: await loadFoodSummary(db, user, from, to) })
  })
  /** A packaged product by its barcode (values per 100 g), from the providers or the saved copy. */
  .get('/barcode/:code', async (c) => {
    const code = parseQuery(barcodeInput, c.req.param('code'))
    const product = await lookupBarcode(c.var.db, c.env, code)
    if (!product)
      throw new HTTPException(404, {
        message: 'We don’t know this product yet. Photograph its nutrition label instead.',
      })
    return c.json<{ product: BarcodeProduct }>({ product })
  })
  /** Foods by name (?q=egg), values per 100 g, from the providers or the saved search. */
  .get('/search', async (c) => {
    const q = parseQuery(foodSearchInput, c.req.query('q') ?? '')
    // A search that isn't saved yet goes out to the providers: keep anyone from flooding them.
    if (!(await withinLimit(c.env.SEND_LIMIT, `food-search:${c.var.user.id}`)))
      throw new HTTPException(429, { message: 'Searching a lot. Please wait a minute.' })
    return c.json<{ results: FoodSearchResult[] }>({
      results: await searchFoods(c.var.db, c.env, q),
    })
  })
  .get('/recent', async (c) => {
    const { db, user } = c.var
    return c.json({ foods: await recentFoods(db, user.id, todayIn(user.timezone)) })
  })
  /** Logs an activity (a walk, padel...) with its estimate. A retry (same clientUuid) is a no-op. */
  .post('/activities', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, activityInput)
    notInFuture(input.date, user.timezone)
    const [existing] = await db
      .select({ userId: activityLogs.userId, date: activityLogs.date })
      .from(activityLogs)
      .where(eq(activityLogs.clientUuid, input.clientUuid))
    if (existing && existing.userId !== user.id) conflict('That activity id is taken.')
    if (!existing) {
      const kg = (await weightOn(db, user.id, input.date))(input.date)
      if (kg === null)
        throw new HTTPException(409, { message: 'Log your weight first, to work out calories.' })
      await db.insert(activityLogs).values({
        clientUuid: input.clientUuid,
        userId: user.id,
        date: input.date,
        kind: input.kind,
        minutes: input.minutes,
        kcal: activityKcal(input.kind, input.minutes, kg),
      })
    }
    return c.json({ day: await loadFoodDay(db, user, existing?.date ?? input.date) }, 201)
  })
  .delete('/activities/:id', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const [row] = await db
      .select({ date: activityLogs.date })
      .from(activityLogs)
      .where(and(eq(activityLogs.id, id), eq(activityLogs.userId, user.id)))
    if (!row) notFound('Activity not found')
    await db.delete(activityLogs).where(eq(activityLogs.id, id))
    return c.json({ day: await loadFoodDay(db, user, row.date) })
  })
  /** Steps for a day; 0 clears them. */
  .put('/steps', async (c) => {
    const { db, user } = c.var
    const { date, steps } = await parseBody(c.req.raw, stepsInput)
    notInFuture(date, user.timezone)
    const mine = and(eq(stepLogs.userId, user.id), eq(stepLogs.date, date))
    if (steps === 0) await db.delete(stepLogs).where(mine)
    else
      await db
        .insert(stepLogs)
        .values({ userId: user.id, date, steps })
        .onConflictDoUpdate({
          target: [stepLogs.userId, stepLogs.date],
          set: { steps, updatedAt: new Date() },
        })
    return c.json({ day: await loadFoodDay(db, user, date) })
  })
  /** Adds foods to a meal. Foods already saved (a retry) are skipped, never saved twice. */
  .post('/', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, addFoodInput)
    const uuids = input.entries.map((e) => e.clientUuid)
    const existing = await db
      .select({ clientUuid: foodEntries.clientUuid, userId: foodEntries.userId })
      .from(foodEntries)
      .where(inArray(foodEntries.clientUuid, uuids))
    if (existing.some((e) => e.userId !== user.id)) conflict('Food id in use')
    const saved = new Set(existing.map((e) => e.clientUuid))
    const rows = input.entries
      .filter((e, i) => !saved.has(e.clientUuid) && uuids.indexOf(e.clientUuid) === i)
      .map((e) => ({
        clientUuid: e.clientUuid,
        userId: user.id,
        date: input.date,
        meal: input.meal,
        name: e.name,
        grams: e.grams ?? null,
        kcal: e.kcal,
        proteinG: e.proteinG,
        carbsG: e.carbsG ?? null,
        fatG: e.fatG ?? null,
        fibreG: e.fibreG ?? null,
        sugarG: e.sugarG ?? null,
        sodiumMg: e.sodiumMg ?? null,
        source: input.source,
      }))
    await runAll(db, insertMany(db, foodEntries, rows))
    return c.json({ day: await loadFoodDay(db, user, input.date) }, 201)
  })
  /** The evening reminder to log food: on or off (Profile). */
  .get('/reminders', async (c) => {
    const { db, user } = c.var
    const [row] = await db
      .select({ on: users.foodReminders })
      .from(users)
      .where(eq(users.id, user.id))
    return c.json({ on: row?.on ?? false })
  })
  .put('/reminders', async (c) => {
    const { db, user } = c.var
    const { on } = await parseBody(c.req.raw, z.object({ on: z.boolean() }))
    await db.update(users).set({ foodReminders: on }).where(eq(users.id, user.id))
    return c.json({ on })
  })
  /** Days in a row with food logged (today not logged yet doesn't break it). */
  .get('/streak', async (c) => {
    const { db, user } = c.var
    const today = todayIn(user.timezone)
    const rows = await db
      .selectDistinct({ date: foodEntries.date })
      .from(foodEntries)
      .where(
        and(
          eq(foodEntries.userId, user.id),
          gte(foodEntries.date, addDays(today, -STREAK_DAYS)),
          lte(foodEntries.date, today),
        ),
      )
    return c.json({
      days: foodStreak(
        rows.map((r) => r.date),
        today,
      ),
    })
  })
  /** Copies one meal's foods to another day or meal ("Copy yesterday's breakfast"). */
  .post('/copy', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, copyMealInput)
    const foods = await db
      .select(entryColumns)
      .from(foodEntries)
      .where(
        and(
          eq(foodEntries.userId, user.id),
          eq(foodEntries.date, input.fromDate),
          eq(foodEntries.meal, input.fromMeal),
        ),
      )
      .orderBy(asc(foodEntries.createdAt), asc(foodEntries.id))
    if (foods.length === 0) notFound('Nothing logged for that meal')
    await logItems(db, user.id, input, foods.map(toEntry))
    return c.json({ day: await loadFoodDay(db, user, input.date) }, 201)
  })
  /** Your saved meals ("My meals"), newest first. */
  .get('/meals', async (c) => {
    const { db, user } = c.var
    const rows = await db
      .select()
      .from(savedMeals)
      .where(eq(savedMeals.userId, user.id))
      .orderBy(desc(savedMeals.createdAt), desc(savedMeals.id))
    return c.json({ meals: rows.map(toSavedMeal) })
  })
  /** Saves the foods of a logged meal under a name. */
  .post('/meals', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, saveMealInput)
    const [foods, [total]] = await Promise.all([
      db
        .select(entryColumns)
        .from(foodEntries)
        .where(
          and(
            eq(foodEntries.userId, user.id),
            eq(foodEntries.date, input.date),
            eq(foodEntries.meal, input.meal),
          ),
        )
        .orderBy(asc(foodEntries.createdAt), asc(foodEntries.id))
        .limit(MAX_SAVED_MEAL_ITEMS),
      db.select({ n: count() }).from(savedMeals).where(eq(savedMeals.userId, user.id)),
    ])
    if (foods.length === 0) notFound('Nothing logged for that meal')
    if ((total?.n ?? 0) >= MAX_SAVED_MEALS)
      throw new HTTPException(409, { message: 'You have a lot of saved meals. Delete one first.' })
    const [row] = await db
      .insert(savedMeals)
      .values({
        userId: user.id,
        name: input.name,
        items: foods.map((f) => ({
          name: f.name,
          grams: f.grams,
          kcal: f.kcal,
          proteinG: f.proteinG,
          carbsG: f.carbsG,
          fatG: f.fatG,
          fibreG: f.fibreG,
          sugarG: f.sugarG,
          sodiumMg: f.sodiumMg,
          source: f.source,
        })),
      })
      .returning()
    if (!row) throw new HTTPException(500, { message: 'Could not save the meal' })
    return c.json({ meal: toSavedMeal(row) }, 201)
  })
  .delete('/meals/:id', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const [row] = await db
      .delete(savedMeals)
      .where(and(eq(savedMeals.id, id), eq(savedMeals.userId, user.id)))
      .returning({ id: savedMeals.id })
    if (!row) notFound('Meal not found')
    return c.body(null, 204)
  })
  /** Logs a saved meal into a day and meal. */
  .post('/meals/:id/log', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const input = await parseBody(c.req.raw, logSavedMealInput)
    const [meal] = await db
      .select()
      .from(savedMeals)
      .where(and(eq(savedMeals.id, id), eq(savedMeals.userId, user.id)))
    if (!meal) notFound('Meal not found')
    await logItems(db, user.id, input, meal.items)
    return c.json({ day: await loadFoodDay(db, user, input.date) }, 201)
  })
  .patch('/:id', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const input = await parseBody(c.req.raw, updateFoodInput)
    const mine = and(eq(foodEntries.id, id), eq(foodEntries.userId, user.id))
    if (Object.keys(input).length === 0) {
      const [row] = await db.select({ date: foodEntries.date }).from(foodEntries).where(mine)
      if (!row) notFound('Food not found')
      return c.json({ day: await loadFoodDay(db, user, row.date) })
    }
    const [row] = await db
      .update(foodEntries)
      .set(input)
      .where(mine)
      .returning({ date: foodEntries.date })
    if (!row) notFound('Food not found')
    return c.json({ day: await loadFoodDay(db, user, row.date) })
  })
  .delete('/:id', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const [row] = await db
      .delete(foodEntries)
      .where(and(eq(foodEntries.id, id), eq(foodEntries.userId, user.id)))
      .returning({ date: foodEntries.date })
    if (!row) notFound('Food not found')
    return c.json({ day: await loadFoodDay(db, user, row.date) })
  })
  /**
   * A photo of a meal or a nutrition label becomes a draft to check. Nothing is saved, and the
   * photo itself goes to Claude and is then dropped (never stored or logged).
   */
  /**
   * "Type it in words": what someone ate, described, turned into foods to check. Counts as one
   * of today's photo estimates (same daily limit, same switch) and is saved with its cost.
   */
  .post('/describe', async (c) => {
    const { db, user } = c.var
    const { text } = await parseBody(c.req.raw, foodDescribeInput)
    const { feature, date, photosLeft } = await claimEstimate(db, c.env, user)
    const meter: ClaudeMeter = { model: feature.model }
    try {
      const draft = await estimateFoodText(c.env, text, meter)
      return c.json<{ draft: FoodPhotoDraft }>({ draft: { ...draft, photosLeft } })
    } catch (err) {
      await releasePhoto(db, user.id, date)
      throw err
    } finally {
      await recordClaudeCall(db, user.id, 'food_photo', meter)
    }
  })
  /** Favourites: foods starred to log again in one tap, newest first. */
  .get('/favourites', async (c) => {
    const { db, user } = c.var
    return c.json<{ favourites: FavouriteFood[] }>({
      favourites: await listFavourites(db, user.id),
    })
  })
  /** Star a food. The same name again updates its numbers. */
  .post('/favourites', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, favouriteInput)
    const [mine] = await db
      .select({ n: count() })
      .from(foodFavourites)
      .where(eq(foodFavourites.userId, user.id))
    const values = {
      grams: input.grams ?? null,
      kcal: input.kcal,
      proteinG: input.proteinG,
      carbsG: input.carbsG ?? null,
      fatG: input.fatG ?? null,
      fibreG: input.fibreG ?? null,
      sugarG: input.sugarG ?? null,
      sodiumMg: input.sodiumMg ?? null,
    }
    const [existing] = await db
      .select({ id: foodFavourites.id })
      .from(foodFavourites)
      .where(and(eq(foodFavourites.userId, user.id), eq(foodFavourites.name, input.name)))
    if (!existing && (mine?.n ?? 0) >= MAX_FAVOURITES)
      conflict(`You can keep ${MAX_FAVOURITES} favourites. Unstar one first.`)
    if (existing)
      await db.update(foodFavourites).set(values).where(eq(foodFavourites.id, existing.id))
    else await db.insert(foodFavourites).values({ userId: user.id, name: input.name, ...values })
    return c.json({ favourites: await listFavourites(db, user.id) }, existing ? 200 : 201)
  })
  .delete('/favourites/:id', async (c) => {
    const { db, user } = c.var
    const [row] = await db
      .delete(foodFavourites)
      .where(
        and(eq(foodFavourites.id, parseId(c.req.param('id'))), eq(foodFavourites.userId, user.id)),
      )
      .returning({ id: foodFavourites.id })
    if (!row) notFound('Favourite not found')
    return c.json({ favourites: await listFavourites(db, user.id) })
  })
  .post('/photo', async (c) => {
    const { db, user } = c.var
    const body = await c.req.parseBody().catch(() => null)
    const photo = body?.photo
    if (!(photo instanceof File) || photo.size === 0)
      throw new HTTPException(400, { message: 'Take or choose a photo' })
    if (!PHOTO_TYPES.has(photo.type))
      throw new HTTPException(400, { message: 'Photos must be JPG, PNG or WebP' })
    if (photo.size > PHOTO_MAX_BYTES)
      throw new HTTPException(400, { message: 'That photo is too big. Try again.' })
    const hint = parseQuery(foodPhotoHint, typeof body?.hint === 'string' ? body.hint : '')
    const { feature, date, photosLeft } = await claimEstimate(db, c.env, user)
    // Every scan is saved with its tokens and cost for the platform admin (never the photo).
    const meter: ClaudeMeter = { model: feature.model }
    try {
      const draft = await estimateFoodPhoto(
        c.env,
        { bytes: new Uint8Array(await photo.arrayBuffer()), type: photo.type },
        hint,
        meter,
      )
      return c.json<{ draft: FoodPhotoDraft }>({ draft: { ...draft, photosLeft } })
    } catch (err) {
      await releasePhoto(db, user.id, date)
      throw err
    } finally {
      await recordClaudeCall(db, user.id, 'food_photo', meter)
    }
  })

/**
 * Before any Claude food estimate (photo or words): set up, switched on, within the person's
 * daily limit. Counts one now (released again if Claude fails).
 */
async function claimEstimate(db: Db, env: Bindings, user: Me) {
  if (!foodPhotosConfigured(env))
    throw new HTTPException(503, { message: 'Food estimates aren’t set up yet.' })
  const feature = await claudeFeature(db, env, 'food_photo')
  if (!feature.enabled)
    throw new HTTPException(403, {
      message: 'Food estimates are turned off at the moment. Type it in instead.',
    })
  const perDay = await photoLimitFor(db, env, user)
  if (perDay === 0)
    throw new HTTPException(403, {
      message: 'Food estimates are switched off for you. Type it in instead.',
    })
  const date = todayIn(user.timezone)
  const photosLeft = await claimPhoto(db, user.id, date, perDay)
  return { feature, date, photosLeft }
}

async function listFavourites(db: Db, userId: number): Promise<FavouriteFood[]> {
  return db
    .select({
      id: foodFavourites.id,
      name: foodFavourites.name,
      grams: foodFavourites.grams,
      kcal: foodFavourites.kcal,
      proteinG: foodFavourites.proteinG,
      carbsG: foodFavourites.carbsG,
      fatG: foodFavourites.fatG,
      fibreG: foodFavourites.fibreG,
      sugarG: foodFavourites.sugarG,
      sodiumMg: foodFavourites.sodiumMg,
    })
    .from(foodFavourites)
    .where(eq(foodFavourites.userId, userId))
    .orderBy(desc(foodFavourites.id))
    .limit(MAX_FAVOURITES)
}

/** One person's photo limit and today's use, for their coach. */
async function loadPhotoLimit(
  db: Db,
  env: Bindings,
  person: { id: number; role: Person['role']; timezone: string; businessId: number | null },
): Promise<PhotoLimit> {
  const [[row], settings, [used], effective] = await Promise.all([
    db.select({ perDay: users.foodPhotosPerDay }).from(users).where(eq(users.id, person.id)),
    foodPhotoSettings(db, env, person.businessId),
    db
      .select({ count: foodPhotoUses.count })
      .from(foodPhotoUses)
      .where(
        and(eq(foodPhotoUses.userId, person.id), eq(foodPhotoUses.date, todayIn(person.timezone))),
      ),
    photoLimitFor(db, env, person),
  ])
  return {
    perDay: row?.perDay ?? null,
    defaultPerDay: settings.perDay,
    effective,
    usedToday: used?.count ?? 0,
    owner: person.role === 'owner',
  }
}

/**
 * Saves daily targets and the calculator's settings (activity, pace, goal, body basics)
 * together. Used by a coach for a client, and by someone without a coach for themselves.
 */
export async function saveTargets(
  db: Db,
  person: { id: number; timezone: string },
  input: ReturnType<typeof nutritionTargetsInput.parse>,
  setBy: number,
) {
  const values = {
    kcal: input.kcal,
    proteinG: input.proteinG,
    carbsG: input.carbsG ?? null,
    fatG: input.fatG ?? null,
    basisWeightKg: input.basisWeightKg ?? null,
    setBy,
  }
  const save = db
    .insert(nutritionTargets)
    .values({ userId: person.id, ...values })
    .onConflictDoUpdate({
      target: nutritionTargets.userId,
      set: { ...values, updatedAt: new Date() },
    })
  // Targets and the calculator's settings (activity, pace, goal, body basics) save together.
  if (input.plan) {
    const { weightKg } = input.plan
    const newWeight =
      weightKg != null && weightKg !== (await latestWeight(db, person.id)) ? weightKg : null
    await db.batch([
      save,
      savePlanSettings(db, person.id, input.plan),
      ...(newWeight === null
        ? []
        : [weighInToday(db, person.id, todayIn(person.timezone), newWeight)]),
    ])
  } else await save
}

/** A client's food log and targets, for the staff who manage them (404 for anyone else). */
export const adminFoodRoutes = new Hono<AppEnv>()
  .get('/:id/food', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { date } = parseQuery(dayQuery, { date: c.req.query('date') })
    const day = date ?? todayIn(person.timezone)
    return c.json({ day: await loadFoodDay(db, person, day, canCoach(c.var.user, person)) })
  })
  .get('/:id/food/summary', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { from, to } = parseQuery(rangeQuery, c.req.query())
    return c.json({
      summary: await loadFoodSummary(db, person, from, to, canCoach(c.var.user, person)),
      today: todayIn(person.timezone),
    })
  })
  .put('/:id/nutrition-targets', async (c) => {
    const { db, user } = c.var
    const person = await managedPerson(db, user, parseId(c.req.param('id')))
    const input = await parseBody(c.req.raw, nutritionTargetsInput)
    await saveTargets(db, person, input, user.id)
    return c.json({ targets: await loadTargets(db, person.id) })
  })
  /** Their daily photo limit: their own number, or null for the site default. */
  .get('/:id/food/photo-limit', async (c) => {
    const person = await managedPerson(c.var.db, c.var.user, parseId(c.req.param('id')))
    return c.json({ photoLimit: await loadPhotoLimit(c.var.db, c.env, person) })
  })
  .put('/:id/food/photo-limit', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { perDay } = await parseBody(c.req.raw, photoLimitInput)
    await db.update(users).set({ foodPhotosPerDay: perDay }).where(eq(users.id, person.id))
    return c.json({ photoLimit: await loadPhotoLimit(db, c.env, person) })
  })
  .delete('/:id/nutrition-targets', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    await db.delete(nutritionTargets).where(eq(nutritionTargets.userId, person.id))
    return c.body(null, 204)
  })
