// Food log routes. meFoodRoutes is mounted inside meRoutes (/me/food) and adminFoodRoutes inside
// adminUserRoutes (/admin/users/:id/…), so each runs behind its parent's sign-in checks once.
import { type Db, foodEntries, foodPhotoUses, nutritionTargets, users } from '@project180/db'
import {
  addDays,
  addFoodInput,
  type BarcodeProduct,
  barcodeInput,
  type FoodDay,
  type FoodEntry,
  type FoodPhotoDraft,
  type FoodSearchResult,
  type FoodSetup,
  type FoodSummary,
  foodPhotoHint,
  foodSearchInput,
  isoDate,
  type NutritionTargets,
  nutritionTargetsInput,
  type PhotoLimit,
  photoLimitInput,
  RECENT_FOOD_DAYS,
  type RecentFood,
  roundGrams,
  roundKcal,
  sumMacros,
  todayIn,
  updateFoodInput,
} from '@project180/shared'
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { managedPerson, type Person } from '../access'
import { barcodeProviders, lookupBarcode } from '../barcode'
import { searchFoods, searchProviders } from '../barcode/search'
import { insertMany, runAll } from '../batch'
import type { AppEnv, Bindings } from '../env'
import { conflict, notFound, parseBody, parseId } from '../errors'
import {
  claimPhoto,
  estimateFoodPhoto,
  foodPhotosConfigured,
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  releasePhoto,
} from '../food-photo'
import { withinLimit } from '../rate-limit'
import { foodPhotoSettings, foodPhotosAvailable, photoLimitFor } from '../settings'

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
  source: foodEntries.source,
  createdAt: foodEntries.createdAt,
}

type EntryRow = { createdAt: Date } & Omit<FoodEntry, 'createdAt'>

const toEntry = (row: EntryRow): FoodEntry => ({ ...row, createdAt: row.createdAt.toISOString() })

/** Query values checked like a body: 400 with the first problem. */
function parseQuery<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue?.path.join('.')
    throw new HTTPException(400, {
      message: field ? `${field}: ${issue?.message}` : (issue?.message ?? 'Invalid query'),
    })
  }
  return result.data
}

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
      updatedAt: nutritionTargets.updatedAt,
    })
    .from(nutritionTargets)
    .where(eq(nutritionTargets.userId, userId))
  return row ? { ...row, updatedAt: row.updatedAt.toISOString() } : null
}

/** One person's day: every food in the order logged, the totals and their targets. */
export async function loadFoodDay(db: Db, userId: number, date: string): Promise<FoodDay> {
  const [rows, targets] = await Promise.all([
    db
      .select(entryColumns)
      .from(foodEntries)
      .where(and(eq(foodEntries.userId, userId), eq(foodEntries.date, date)))
      .orderBy(asc(foodEntries.createdAt), asc(foodEntries.id)),
    loadTargets(db, userId),
  ])
  const entries = rows.map(toEntry)
  return { date, entries, totals: sumMacros(entries), targets }
}

/** Totals per day over a range, added up in SQL (only days with food are listed). */
export async function loadFoodSummary(
  db: Db,
  userId: number,
  from: string,
  to: string,
): Promise<FoodSummary> {
  const [rows, targets] = await Promise.all([
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
  ])
  return {
    from,
    to,
    targets,
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
    return c.json({ day: await loadFoodDay(db, user.id, date ?? todayIn(user.timezone)) })
  })
  .get('/summary', async (c) => {
    const { db, user } = c.var
    const { from, to } = parseQuery(rangeQuery, c.req.query())
    return c.json({ summary: await loadFoodSummary(db, user.id, from, to) })
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
        source: input.source,
      }))
    await runAll(db, insertMany(db, foodEntries, rows))
    return c.json({ day: await loadFoodDay(db, user.id, input.date) }, 201)
  })
  .patch('/:id', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const input = await parseBody(c.req.raw, updateFoodInput)
    const mine = and(eq(foodEntries.id, id), eq(foodEntries.userId, user.id))
    if (Object.keys(input).length === 0) {
      const [row] = await db.select({ date: foodEntries.date }).from(foodEntries).where(mine)
      if (!row) notFound('Food not found')
      return c.json({ day: await loadFoodDay(db, user.id, row.date) })
    }
    const [row] = await db
      .update(foodEntries)
      .set(input)
      .where(mine)
      .returning({ date: foodEntries.date })
    if (!row) notFound('Food not found')
    return c.json({ day: await loadFoodDay(db, user.id, row.date) })
  })
  .delete('/:id', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const [row] = await db
      .delete(foodEntries)
      .where(and(eq(foodEntries.id, id), eq(foodEntries.userId, user.id)))
      .returning({ date: foodEntries.date })
    if (!row) notFound('Food not found')
    return c.json({ day: await loadFoodDay(db, user.id, row.date) })
  })
  /**
   * A photo of a meal or a nutrition label becomes a draft to check. Nothing is saved, and the
   * photo itself goes to Claude and is then dropped (never stored or logged).
   */
  .post('/photo', async (c) => {
    const { db, user } = c.var
    if (!foodPhotosConfigured(c.env))
      throw new HTTPException(503, { message: 'Photo estimates aren’t set up yet.' })
    if (!(await foodPhotosAvailable(db, c.env)))
      throw new HTTPException(403, {
        message: 'Photo estimates are turned off at the moment. Type it in instead.',
      })
    const body = await c.req.parseBody().catch(() => null)
    const photo = body?.photo
    if (!(photo instanceof File) || photo.size === 0)
      throw new HTTPException(400, { message: 'Take or choose a photo' })
    if (!PHOTO_TYPES.has(photo.type))
      throw new HTTPException(400, { message: 'Photos must be JPG, PNG or WebP' })
    if (photo.size > PHOTO_MAX_BYTES)
      throw new HTTPException(400, { message: 'That photo is too big. Try again.' })
    const hint = parseQuery(foodPhotoHint, typeof body?.hint === 'string' ? body.hint : '')
    const perDay = await photoLimitFor(db, c.env, user)
    if (perDay === 0)
      throw new HTTPException(403, {
        message: 'Photo estimates are switched off for you. Type it in instead.',
      })
    const date = todayIn(user.timezone)
    const photosLeft = await claimPhoto(db, user.id, date, perDay)
    try {
      const draft = await estimateFoodPhoto(
        c.env,
        { bytes: new Uint8Array(await photo.arrayBuffer()), type: photo.type },
        hint,
      )
      return c.json<{ draft: FoodPhotoDraft }>({ draft: { ...draft, photosLeft } })
    } catch (err) {
      await releasePhoto(db, user.id, date)
      throw err
    }
  })

/** One person's photo limit and today's use, for their coach. */
async function loadPhotoLimit(
  db: Db,
  env: Bindings,
  person: { id: number; role: Person['role']; timezone: string },
): Promise<PhotoLimit> {
  const [[row], settings, [used], effective] = await Promise.all([
    db.select({ perDay: users.foodPhotosPerDay }).from(users).where(eq(users.id, person.id)),
    foodPhotoSettings(db, env),
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
  }
}

/** A client's food log and targets, for the staff who manage them (404 for anyone else). */
export const adminFoodRoutes = new Hono<AppEnv>()
  .get('/:id/food', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { date } = parseQuery(dayQuery, { date: c.req.query('date') })
    return c.json({ day: await loadFoodDay(db, person.id, date ?? todayIn(person.timezone)) })
  })
  .get('/:id/food/summary', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { from, to } = parseQuery(rangeQuery, c.req.query())
    return c.json({
      summary: await loadFoodSummary(db, person.id, from, to),
      today: todayIn(person.timezone),
    })
  })
  .put('/:id/nutrition-targets', async (c) => {
    const { db, user } = c.var
    const person = await managedPerson(db, user, parseId(c.req.param('id')))
    const input = await parseBody(c.req.raw, nutritionTargetsInput)
    const values = {
      kcal: input.kcal,
      proteinG: input.proteinG,
      carbsG: input.carbsG ?? null,
      fatG: input.fatG ?? null,
      setBy: user.id,
    }
    await db
      .insert(nutritionTargets)
      .values({ userId: person.id, ...values })
      .onConflictDoUpdate({
        target: nutritionTargets.userId,
        set: { ...values, updatedAt: new Date() },
      })
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
