// Water routes. meWaterRoutes is mounted inside meRoutes (/me/water) and adminWaterRoutes inside
// adminUserRoutes (/admin/users/:id/water…), so each runs behind its parent's sign-in checks.
// The goal (users.water_goal_ml) can be set by the person themselves or by staff who manage them.
import { type Db, users, waterLogs } from '@project180/db'
import {
  addDays,
  addWaterInput,
  isoDate,
  todayIn,
  type WaterDay,
  type WaterSummary,
  waterGoalInput,
} from '@project180/shared'
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { managedPerson } from '../access'
import type { AppEnv } from '../env'
import { conflict, notFound, parseBody, parseId } from '../errors'

/** The longest range one summary may cover (a quarter), like food. */
const MAX_RANGE_DAYS = 92

const dayQuery = z.object({ date: isoDate.optional() })
const rangeQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((r) => r.from <= r.to, 'from must be on or before to')
  .refine((r) => addDays(r.from, MAX_RANGE_DAYS - 1) >= r.to, `At most ${MAX_RANGE_DAYS} days`)

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

async function loadGoal(db: Db, userId: number): Promise<number | null> {
  const [row] = await db
    .select({ goalMl: users.waterGoalMl })
    .from(users)
    .where(eq(users.id, userId))
  return row?.goalMl ?? null
}

/** One person's water for a day: the goal, the total and each log. Two reads, run together. */
export async function loadWaterDay(db: Db, userId: number, date: string): Promise<WaterDay> {
  const [goalMl, rows] = await Promise.all([
    loadGoal(db, userId),
    db
      .select({ id: waterLogs.id, ml: waterLogs.ml, createdAt: waterLogs.createdAt })
      .from(waterLogs)
      .where(and(eq(waterLogs.userId, userId), eq(waterLogs.date, date)))
      .orderBy(asc(waterLogs.createdAt), asc(waterLogs.id)),
  ])
  return {
    date,
    goalMl,
    ml: rows.reduce((total, r) => total + r.ml, 0),
    logs: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  }
}

/** Water per day over a range, added up in SQL (only days with water are listed). */
export async function loadWaterSummary(
  db: Db,
  userId: number,
  from: string,
  to: string,
): Promise<WaterSummary> {
  const [goalMl, rows] = await Promise.all([
    loadGoal(db, userId),
    db
      .select({ date: waterLogs.date, ml: sql<number>`coalesce(sum(${waterLogs.ml}), 0)` })
      .from(waterLogs)
      .where(and(eq(waterLogs.userId, userId), gte(waterLogs.date, from), lte(waterLogs.date, to)))
      .groupBy(waterLogs.date)
      .orderBy(asc(waterLogs.date)),
  ])
  return { from, to, goalMl, days: rows.map((r) => ({ date: r.date, ml: Number(r.ml) })) }
}

async function saveGoal(db: Db, userId: number, goalMl: number | null) {
  await db.update(users).set({ waterGoalMl: goalMl }).where(eq(users.id, userId))
}

/** The signed-in person's own water. Only ever their own rows (c.var.user.id). */
export const meWaterRoutes = new Hono<AppEnv>()
  /** One day (today when no ?date). */
  .get('/', async (c) => {
    const { db, user } = c.var
    const { date } = parseQuery(dayQuery, { date: c.req.query('date') })
    return c.json({ water: await loadWaterDay(db, user.id, date ?? todayIn(user.timezone)) })
  })
  .get('/summary', async (c) => {
    const { db, user } = c.var
    const { from, to } = parseQuery(rangeQuery, c.req.query())
    return c.json({ summary: await loadWaterSummary(db, user.id, from, to) })
  })
  /** Drank some water. A retry with the same clientUuid is saved once. */
  .post('/', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, addWaterInput)
    const [clash] = await db
      .select({ userId: waterLogs.userId })
      .from(waterLogs)
      .where(eq(waterLogs.clientUuid, input.clientUuid))
    if (clash && clash.userId !== user.id) conflict('Water id in use')
    if (!clash)
      await db
        .insert(waterLogs)
        .values({ clientUuid: input.clientUuid, userId: user.id, date: input.date, ml: input.ml })
        .onConflictDoNothing({ target: waterLogs.clientUuid })
    return c.json({ water: await loadWaterDay(db, user.id, input.date) }, 201)
  })
  /** Clear a whole day's water (?date=, today when missing). Only ever your own rows. */
  .delete('/', async (c) => {
    const { db, user } = c.var
    const { date } = parseQuery(dayQuery, { date: c.req.query('date') })
    const day = date ?? todayIn(user.timezone)
    await db.delete(waterLogs).where(and(eq(waterLogs.userId, user.id), eq(waterLogs.date, day)))
    return c.json({ water: await loadWaterDay(db, user.id, day) })
  })
  /** Remove one drink (Undo sends the last one; the list can remove any). */
  .delete('/:id', async (c) => {
    const { db, user } = c.var
    const [row] = await db
      .delete(waterLogs)
      .where(and(eq(waterLogs.id, parseId(c.req.param('id'))), eq(waterLogs.userId, user.id)))
      .returning({ date: waterLogs.date })
    if (!row) notFound('Water not found')
    return c.json({ water: await loadWaterDay(db, user.id, row.date) })
  })
  /** Change your own daily goal (null clears it). Your coach can change it too. */
  .put('/goal', async (c) => {
    const { db, user } = c.var
    const { goalMl } = await parseBody(c.req.raw, waterGoalInput)
    await saveGoal(db, user.id, goalMl)
    return c.json({ goalMl })
  })

/** A client's water and goal, for the staff who manage them (404 for anyone else). */
export const adminWaterRoutes = new Hono<AppEnv>()
  .get('/:id/water', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { date } = parseQuery(dayQuery, { date: c.req.query('date') })
    return c.json({ water: await loadWaterDay(db, person.id, date ?? todayIn(person.timezone)) })
  })
  .get('/:id/water/summary', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { from, to } = parseQuery(rangeQuery, c.req.query())
    return c.json({
      summary: await loadWaterSummary(db, person.id, from, to),
      today: todayIn(person.timezone),
    })
  })
  .put('/:id/water/goal', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { goalMl } = await parseBody(c.req.raw, waterGoalInput)
    await saveGoal(db, person.id, goalMl)
    return c.json({ goalMl })
  })
