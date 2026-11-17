import {
  type Db,
  type ExerciseRow,
  exerciseAlternatives,
  exercises,
  sessionExercises,
  setLogs,
  workoutExercises,
  workouts,
} from '@project180/db'
import {
  type Exercise,
  exerciseAlternativesInput,
  exerciseInput,
  exerciseUpdate,
  type Me,
} from '@project180/shared'
import { and, asc, count, countDistinct, eq, inArray, isNull, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { insertMany, runAll } from '../batch'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId } from '../errors'
import { assertCanEdit, visibleTo } from '../library'
import { deletePhotos, savePhotos } from '../media'
import { requireAdmin, requireUser } from '../middleware'

function toExercise(r: ExerciseRow): Exercise {
  return {
    id: r.id,
    name: r.name,
    muscleGroup: r.muscleGroup,
    category: r.category,
    equipment: r.equipment,
    trackingType: r.trackingType,
    instructions: r.instructions,
    keywords: r.keywords,
    imageKey: r.imageKey,
    videoUrl: r.videoUrl,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }
}

async function findVisible(
  db: Db,
  user: Me,
  id: number,
  archived: boolean | 'any' = false,
): Promise<ExerciseRow> {
  const [row] = await db
    .select()
    .from(exercises)
    .where(and(eq(exercises.id, id), visibleTo(exercises, user, archived)))
    .limit(1)
  // A private exercise you can't see answers 404, not 403, so ids reveal nothing.
  if (!row) notFound('Exercise not found')
  return row
}

/** Where an exercise is used. Anything used can be archived, not deleted. */
/** Where an exercise is used: workouts, logged sets, and past workouts it was in (snapshots). */
async function usageOf(db: Db, id: number) {
  const [inWorkouts, [logged], [history]] = await Promise.all([
    db
      .selectDistinct({ id: workouts.id, name: workouts.name, archived: workouts.archivedAt })
      .from(workoutExercises)
      .innerJoin(workouts, eq(workouts.id, workoutExercises.workoutId))
      .where(eq(workoutExercises.exerciseId, id)),
    db.select({ n: count() }).from(setLogs).where(eq(setLogs.exerciseId, id)),
    // In workouts done before (as prescribed, or swapped from), even with nothing logged.
    db
      .select({ n: countDistinct(sessionExercises.sessionId) })
      .from(sessionExercises)
      .where(or(eq(sessionExercises.exerciseId, id), eq(sessionExercises.originalExerciseId, id))),
  ])
  return {
    workouts: inWorkouts.map((w) => ({ id: w.id, name: w.name, archived: w.archived !== null })),
    loggedSets: logged?.n ?? 0,
    pastWorkouts: history?.n ?? 0,
  }
}

async function alternativesOf(db: Db, id: number) {
  const rows = await db
    .select({ id: exerciseAlternatives.alternativeId })
    .from(exerciseAlternatives)
    .innerJoin(exercises, eq(exercises.id, exerciseAlternatives.alternativeId))
    .where(and(eq(exerciseAlternatives.exerciseId, id), isNull(exercises.archivedAt)))
    .orderBy(asc(exerciseAlternatives.position))
  return rows.map((r) => r.id)
}

export const exerciseRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get('/', async (c) => {
    const archived = c.req.query('archived') === '1'
    const rows = await c.var.db
      .select()
      .from(exercises)
      .where(visibleTo(exercises, c.var.user, archived))
      .orderBy(asc(exercises.name))
    return c.json({ exercises: rows.map(toExercise) })
  })
  .get('/:id', async (c) => {
    const row = await findVisible(c.var.db, c.var.user, parseId(c.req.param('id')), 'any')
    return c.json({ exercise: toExercise(row) })
  })
  .post('/', async (c) => {
    const input = await parseBody(c.req.raw, exerciseInput)
    const [row] = await c.var.db
      .insert(exercises)
      .values({ ...input, createdBy: c.var.user.id, businessId: c.var.user.businessId })
      .returning()
    if (!row) throw new Error('Insert returned no row')
    return c.json({ exercise: toExercise(row) }, 201)
  })
  .patch('/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisible(c.var.db, c.var.user, id, 'any')
    assertCanEdit(c.var.user, existing)
    const input = await parseBody(c.req.raw, exerciseUpdate)
    if (Object.keys(input).length === 0) return c.json({ exercise: toExercise(existing) })
    const [row] = await c.var.db
      .update(exercises)
      .set(input)
      .where(eq(exercises.id, id))
      .returning()
    return c.json({ exercise: toExercise(row ?? existing) })
  })
  .delete('/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisible(c.var.db, c.var.user, id)
    assertCanEdit(c.var.user, existing)
    // Archive, never delete: past workouts still point at it.
    await c.var.db.update(exercises).set({ archivedAt: new Date() }).where(eq(exercises.id, id))
    return c.body(null, 204)
  })
  .get('/:id/usage', async (c) => {
    const id = parseId(c.req.param('id'))
    await findVisible(c.var.db, c.var.user, id, 'any')
    return c.json({ usage: await usageOf(c.var.db, id) })
  })
  /** The coach's suggested swaps for this exercise, in order (archived ones left out). */
  .get('/:id/alternatives', async (c) => {
    const id = parseId(c.req.param('id'))
    await findVisible(c.var.db, c.var.user, id, 'any')
    return c.json({ alternativeIds: await alternativesOf(c.var.db, id) })
  })
  /**
   * Set them. Any coach can: they're suggestions shared by the whole team, like the library itself.
   * Replaces the whole list.
   */
  .put('/:id/alternatives', async (c) => {
    const { db } = c.var
    const id = parseId(c.req.param('id'))
    await findVisible(db, c.var.user, id, 'any')
    const { alternativeIds } = await parseBody(c.req.raw, exerciseAlternativesInput)
    const ids = alternativeIds.filter((a) => a !== id)
    const found = ids.length
      ? await db
          .select({ id: exercises.id })
          .from(exercises)
          .where(and(inArray(exercises.id, ids), visibleTo(exercises, c.var.user)))
      : []
    if (found.length !== ids.length) notFound('Exercise not found')
    await runAll(db, [
      db.delete(exerciseAlternatives).where(eq(exerciseAlternatives.exerciseId, id)),
      ...insertMany(
        db,
        exerciseAlternatives,
        ids.map((alternativeId, position) => ({
          exerciseId: id,
          alternativeId,
          position,
          createdBy: c.var.user.id,
        })),
      ),
    ])
    return c.json({ alternativeIds: await alternativesOf(db, id) })
  })
  /** Delete for good, only when nothing uses it. */
  .delete('/:id/permanent', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisible(c.var.db, c.var.user, id, 'any')
    assertCanEdit(c.var.user, existing)
    const usage = await usageOf(c.var.db, id)
    if (!usage.workouts.length && !usage.loggedSets && usage.pastWorkouts)
      throw new HTTPException(409, { message: 'It’s in past workouts. Archive it instead.' })
    if (usage.workouts.length || usage.loggedSets) {
      const parts = [
        usage.workouts.length
          ? `${usage.workouts.length} workout${usage.workouts.length === 1 ? '' : 's'}`
          : null,
        usage.loggedSets
          ? `${usage.loggedSets} logged set${usage.loggedSets === 1 ? '' : 's'}`
          : null,
      ].filter(Boolean)
      throw new HTTPException(409, {
        message: `It's used in ${parts.join(' and ')}. Archive it instead.`,
      })
    }
    await c.var.db.delete(exercises).where(eq(exercises.id, id))
    return c.body(null, 204)
  })
  /** Upload the start (and optionally finish) photo; replaces any earlier upload or stock photo. */
  .post('/:id/photos', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const existing = await findVisible(db, user, id, 'any')
    assertCanEdit(user, existing)
    const body = await c.req.parseBody()
    const files = [body.start, body.finish].filter(
      (f): f is File => f instanceof File && f.size > 0,
    )
    if (!(body.start instanceof File))
      throw new HTTPException(400, { message: 'Choose a start photo' })
    const imageKey = await savePhotos(c.env, id, files)
    await deletePhotos(c.env, existing.imageKey)
    const [row] = await db
      .update(exercises)
      .set({ imageKey })
      .where(eq(exercises.id, id))
      .returning()
    return c.json({ exercise: toExercise(row ?? existing) })
  })
  /** Remove the photos. `none` (not empty) so the seed never adds a stock photo back. */
  .delete('/:id/photos', async (c) => {
    const { db, user } = c.var
    const id = parseId(c.req.param('id'))
    const existing = await findVisible(db, user, id, 'any')
    assertCanEdit(user, existing)
    await deletePhotos(c.env, existing.imageKey)
    const [row] = await db
      .update(exercises)
      .set({ imageKey: 'none' })
      .where(eq(exercises.id, id))
      .returning()
    return c.json({ exercise: toExercise(row ?? existing) })
  })
  .post('/:id/restore', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisible(c.var.db, c.var.user, id, true)
    assertCanEdit(c.var.user, existing)
    const [row] = await c.var.db
      .update(exercises)
      .set({ archivedAt: null })
      .where(eq(exercises.id, id))
      .returning()
    return c.json({ exercise: toExercise(row ?? existing) })
  })
