import {
  type Db,
  exercises,
  users,
  workoutExercises,
  workoutGroups,
  workouts,
} from '@project180/db'
import {
  type Me,
  type MuscleGroup,
  type WorkoutDetail,
  type WorkoutExerciseInput,
  type WorkoutExerciseItem,
  type WorkoutGroup,
  type WorkoutSummary,
  workoutInput,
} from '@project180/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { managedPerson } from '../access'
import { insertMany, runAll } from '../batch'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId } from '../errors'
import { assertCanEditItem, libraryOnly, visibleTo } from '../library'
import { requireAdmin, requireUser } from '../middleware'
import { purgeWorkout, workoutImpact } from '../purge'

type WorkoutRow = typeof workouts.$inferSelect

/** Exercises of each workout, in order, with names from the library. */
export async function loadWorkoutExercises(
  db: Db,
  workoutIds: number[],
): Promise<Map<number, WorkoutExerciseItem[]>> {
  const result = new Map<number, WorkoutExerciseItem[]>()
  if (workoutIds.length === 0) return result
  const rows = await db
    .select({
      workoutId: workoutExercises.workoutId,
      exerciseId: workoutExercises.exerciseId,
      exerciseName: exercises.name,
      muscleGroup: exercises.muscleGroup,
      trackingType: exercises.trackingType,
      instructions: exercises.instructions,
      imageKey: exercises.imageKey,
      videoUrl: exercises.videoUrl,
      targetSets: workoutExercises.targetSets,
      targetRepsMin: workoutExercises.targetRepsMin,
      targetRepsMax: workoutExercises.targetRepsMax,
      targetRepsPerSet: workoutExercises.targetRepsPerSet,
      bodyweight: workoutExercises.bodyweight,
      targetSeconds: workoutExercises.targetSeconds,
      restSeconds: workoutExercises.restSeconds,
      section: workoutExercises.section,
      targetDistanceM: workoutExercises.targetDistanceM,
      targetPaceSeconds: workoutExercises.targetPaceSeconds,
      targetHrZone: workoutExercises.targetHrZone,
      supersetGroup: workoutExercises.supersetGroup,
      notes: workoutExercises.notes,
    })
    .from(workoutExercises)
    .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
    .where(inArray(workoutExercises.workoutId, workoutIds))
    .orderBy(asc(workoutExercises.workoutId), asc(workoutExercises.position))
  for (const { workoutId, ...item } of rows) {
    const list = result.get(workoutId) ?? []
    list.push(item)
    result.set(workoutId, list)
  }
  return result
}

/** Group settings (rounds, intervals) of each workout. */
export async function loadWorkoutGroups(
  db: Db,
  workoutIds: number[],
): Promise<Map<number, WorkoutGroup[]>> {
  const result = new Map<number, WorkoutGroup[]>()
  if (workoutIds.length === 0) return result
  const rows = await db
    .select()
    .from(workoutGroups)
    .where(inArray(workoutGroups.workoutId, workoutIds))
    .orderBy(asc(workoutGroups.groupNumber))
  for (const r of rows) {
    const list = result.get(r.workoutId) ?? []
    list.push({
      groupNumber: r.groupNumber,
      kind: r.kind,
      rounds: r.rounds,
      workSeconds: r.workSeconds,
      restSeconds: r.restSeconds,
    })
    result.set(r.workoutId, list)
  }
  return result
}

/** Names of the clients that personal copies belong to. */
export async function clientNames(db: Db, ids: Array<number | null>): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((v): v is number => v !== null))]
  if (unique.length === 0) return new Map()
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, unique))
  return new Map(rows.map((r) => [r.id, r.name]))
}

function toSummary(
  r: WorkoutRow,
  items: WorkoutExerciseItem[],
  names: Map<number, string>,
): WorkoutSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    estimatedMinutes: r.estimatedMinutes,
    createdBy: r.createdBy,
    clientId: r.clientId,
    clientName: r.clientId !== null ? (names.get(r.clientId) ?? null) : null,
    sourceWorkoutId: r.sourceWorkoutId,
    exerciseCount: items.length,
    muscleGroups: [...new Set(items.map((i) => i.muscleGroup))] as MuscleGroup[],
    archived: r.archivedAt !== null,
    updatedAt: r.updatedAt.toISOString(),
  }
}

async function findVisible(db: Db, user: Me, id: number, archived: boolean | 'any' = 'any') {
  const [row] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, id), visibleTo(workouts, user, archived)))
    .limit(1)
  if (!row) notFound('Workout not found')
  return row
}

async function detail(db: Db, row: WorkoutRow): Promise<WorkoutDetail> {
  const items = (await loadWorkoutExercises(db, [row.id])).get(row.id) ?? []
  const groups = (await loadWorkoutGroups(db, [row.id])).get(row.id) ?? []
  return {
    ...toSummary(row, items, await clientNames(db, [row.clientId])),
    exercises: items,
    groups,
  }
}

/** Every exercise in the workout must exist and be visible to the person building it. */
async function assertExercisesUsable(
  db: Db,
  user: Me,
  input: { exercises: Array<{ exerciseId: number }> },
) {
  const ids = [...new Set(input.exercises.map((e) => e.exerciseId))]
  if (ids.length === 0) return
  const found = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(and(inArray(exercises.id, ids), visibleTo(exercises, user, 'any')))
  if (found.length !== ids.length)
    throw new HTTPException(400, { message: 'Unknown exercise in workout' })
}

function exerciseRows(workoutId: number, input: { exercises?: WorkoutExerciseInput[] }) {
  return (input.exercises ?? []).map((e, position) => ({
    workoutId,
    exerciseId: e.exerciseId,
    position,
    targetSets: e.targetSets ?? 3,
    targetRepsMin: e.targetRepsMin ?? null,
    targetRepsMax: e.targetRepsMax ?? null,
    targetRepsPerSet: e.targetRepsPerSet?.length ? e.targetRepsPerSet : null,
    bodyweight: e.bodyweight ?? false,
    targetSeconds: e.targetSeconds ?? null,
    restSeconds: e.restSeconds ?? 90,
    section: e.section ?? 'main',
    targetDistanceM: e.targetDistanceM ?? null,
    targetPaceSeconds: e.targetPaceSeconds ?? null,
    targetHrZone: e.targetHrZone ?? null,
    supersetGroup: e.supersetGroup ?? null,
    notes: e.notes ?? null,
  }))
}

type WorkoutInputParsed = ReturnType<typeof workoutInput.parse>

function groupRows(workoutId: number, input: { groups: WorkoutInputParsed['groups'] }) {
  return input.groups.map((g) => ({
    workoutId,
    groupNumber: g.groupNumber,
    kind: g.kind,
    rounds: g.rounds,
    workSeconds: g.workSeconds ?? null,
    restSeconds: g.restSeconds ?? null,
  }))
}

/** The row for a client's copy of a workout (rows and groups are copied separately). */
export function workoutCopyValues(
  source: typeof workouts.$inferSelect,
  clientId: number,
  actorId: number,
) {
  return {
    name: source.name,
    description: source.description,
    estimatedMinutes: source.estimatedMinutes,
    createdBy: actorId,
    clientId,
    sourceWorkoutId: source.sourceWorkoutId ?? source.id,
  }
}

/**
 * Makes a client's personal copy of a workout (exercises and groups included).
 * Returns the copy's id. Already that client's? Returns it as is.
 */
export async function copyWorkoutForClient(
  db: Db,
  workoutId: number,
  clientId: number,
  actorId: number,
) {
  const [source] = await db.select().from(workouts).where(eq(workouts.id, workoutId))
  if (!source) notFound('Workout not found')
  if (source.clientId === clientId) return source.id
  const [copy] = await db
    .insert(workouts)
    .values(workoutCopyValues(source, clientId, actorId))
    .returning({ id: workouts.id })
  if (!copy) throw new Error('Insert returned no row')
  const items = await db
    .select()
    .from(workoutExercises)
    .where(eq(workoutExercises.workoutId, source.id))
  const groups = await db.select().from(workoutGroups).where(eq(workoutGroups.workoutId, source.id))
  await runAll(db, [
    ...insertMany(
      db,
      workoutExercises,
      items.map(({ id: _id, ...r }) => ({ ...r, workoutId: copy.id })),
    ),
    ...insertMany(
      db,
      workoutGroups,
      groups.map(({ id: _id, ...r }) => ({ ...r, workoutId: copy.id })),
    ),
  ])
  return copy.id
}

/**
 * Rewrites a client's workout copy to match the library workout it came from, keeping its id
 * (sessions and program days point at it). Past sessions keep their own snapshot.
 */
export async function overwriteWorkoutCopy(db: Db, fromId: number, toId: number) {
  const [[source], items, groups] = await Promise.all([
    db.select().from(workouts).where(eq(workouts.id, fromId)),
    db.select().from(workoutExercises).where(eq(workoutExercises.workoutId, fromId)),
    db.select().from(workoutGroups).where(eq(workoutGroups.workoutId, fromId)),
  ])
  if (!source) notFound('Workout not found')
  await runAll(db, [
    db
      .update(workouts)
      .set({
        name: source.name,
        description: source.description,
        estimatedMinutes: source.estimatedMinutes,
      })
      .where(eq(workouts.id, toId)),
    db.delete(workoutExercises).where(eq(workoutExercises.workoutId, toId)),
    db.delete(workoutGroups).where(eq(workoutGroups.workoutId, toId)),
    ...insertMany(
      db,
      workoutExercises,
      items.map(({ id: _id, ...r }) => ({ ...r, workoutId: toId })),
    ),
    ...insertMany(
      db,
      workoutGroups,
      groups.map(({ id: _id, ...r }) => ({ ...r, workoutId: toId })),
    ),
  ])
}

async function createWorkout(db: Db, user: Me, input: WorkoutInputParsed) {
  const [row] = await db
    .insert(workouts)
    .values({
      name: input.name,
      description: input.description ?? null,
      estimatedMinutes: input.estimatedMinutes ?? null,
      createdBy: user.id,
    })
    .returning()
  if (!row) throw new Error('Insert returned no row')
  await runAll(db, [
    ...insertMany(db, workoutExercises, exerciseRows(row.id, input)),
    ...insertMany(db, workoutGroups, groupRows(row.id, input)),
  ])
  return row
}

export const workoutRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  /** The library. `?clientId=` adds that client's personal copies (for their program builder). */
  .get('/', async (c) => {
    const archived = c.req.query('archived') === '1'
    const clientParam = c.req.query('clientId')
    const clientId = clientParam
      ? (await managedPerson(c.var.db, c.var.user, Number(clientParam))).id
      : undefined
    const rows = await c.var.db
      .select()
      .from(workouts)
      .where(and(visibleTo(workouts, c.var.user, archived), libraryOnly(workouts, clientId)))
      .orderBy(asc(workouts.name))
    const items = await loadWorkoutExercises(
      c.var.db,
      rows.map((r) => r.id),
    )
    const names = await clientNames(
      c.var.db,
      rows.map((r) => r.clientId),
    )
    return c.json({ workouts: rows.map((r) => toSummary(r, items.get(r.id) ?? [], names)) })
  })
  .get('/:id', async (c) => {
    const row = await findVisible(c.var.db, c.var.user, parseId(c.req.param('id')))
    return c.json({ workout: await detail(c.var.db, row) })
  })
  .post('/', async (c) => {
    const input = await parseBody(c.req.raw, workoutInput)
    await assertExercisesUsable(c.var.db, c.var.user, input)
    const row = await createWorkout(c.var.db, c.var.user, input)
    return c.json({ workout: await detail(c.var.db, row) }, 201)
  })
  .put('/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisible(c.var.db, c.var.user, id)
    await assertCanEditItem(c.var.db, c.var.user, existing)
    const input = await parseBody(c.req.raw, workoutInput)
    await assertExercisesUsable(c.var.db, c.var.user, input)
    const rows = exerciseRows(id, input)
    const groups = groupRows(id, input)
    // One batch: the workout and its exercise list change together or not at all.
    await c.var.db.batch([
      c.var.db
        .update(workouts)
        .set({
          name: input.name,
          description: input.description ?? null,
          estimatedMinutes: input.estimatedMinutes ?? null,
        })
        .where(eq(workouts.id, id)),
      c.var.db.delete(workoutExercises).where(eq(workoutExercises.workoutId, id)),
      c.var.db.delete(workoutGroups).where(eq(workoutGroups.workoutId, id)),
      ...insertMany(c.var.db, workoutExercises, rows),
      ...insertMany(c.var.db, workoutGroups, groups),
    ])
    const updated = await findVisible(c.var.db, c.var.user, id)
    return c.json({ workout: await detail(c.var.db, updated) })
  })
  .post('/:id/duplicate', async (c) => {
    const source = await detail(
      c.var.db,
      await findVisible(c.var.db, c.var.user, parseId(c.req.param('id'))),
    )
    const row = await createWorkout(
      c.var.db,
      c.var.user,
      workoutInput.parse({
        name: `${source.name} (copy)`.slice(0, 80),
        description: source.description,
        estimatedMinutes: source.estimatedMinutes,
        exercises: source.exercises,
        groups: source.groups,
      }),
    )
    return c.json({ workout: await detail(c.var.db, row) }, 201)
  })
  .delete('/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisible(c.var.db, c.var.user, id, false)
    await assertCanEditItem(c.var.db, c.var.user, existing)
    await c.var.db.update(workouts).set({ archivedAt: new Date() }).where(eq(workouts.id, id))
    return c.body(null, 204)
  })
  .get('/:id/impact', async (c) => {
    const id = parseId(c.req.param('id'))
    await findVisible(c.var.db, c.var.user, id)
    return c.json({ impact: await workoutImpact(c.var.db, c.var.user, id) })
  })
  /** Delete for good, with its logged history. Refused (409) while any program still uses it. */
  .delete('/:id/permanent', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisible(c.var.db, c.var.user, id)
    await assertCanEditItem(c.var.db, c.var.user, existing)
    await purgeWorkout(c.var.db, c.var.user, id)
    return c.body(null, 204)
  })
  .post('/:id/restore', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisible(c.var.db, c.var.user, id, true)
    await assertCanEditItem(c.var.db, c.var.user, existing)
    await c.var.db.update(workouts).set({ archivedAt: null }).where(eq(workouts.id, id))
    return c.json({ workout: await detail(c.var.db, { ...existing, archivedAt: null }) })
  })
