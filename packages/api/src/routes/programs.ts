import {
  type Db,
  enrollments,
  programDays,
  programs,
  users,
  workoutExercises,
  workoutGroups,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  type Me,
  type ProgramCopySummary,
  type ProgramDay,
  type ProgramDetail,
  type ProgramSummary,
  programInput,
  syncCopiesInput,
} from '@project180/shared'
import { and, asc, eq, inArray, max, notExists, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { managedPerson, managedUsers } from '../access'
import { inChunks, insertMany, runAll } from '../batch'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId } from '../errors'
import { assertCanEditItem, libraryOnly, visibleTo } from '../library'
import { requireAdmin, requireUser } from '../middleware'
import { programImpact, purgeProgram } from '../purge'
import {
  clientNames,
  copyWorkoutForClient,
  overwriteWorkoutCopy,
  workoutCopyValues,
} from './workouts'

type ProgramRow = typeof programs.$inferSelect
type ProgramInputParsed = ReturnType<typeof programInput.parse>

function toSummary(r: ProgramRow, days: ProgramDay[], names: Map<number, string>): ProgramSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    durationWeeks: r.durationWeeks,
    createdBy: r.createdBy,
    clientId: r.clientId,
    clientName: r.clientId !== null ? (names.get(r.clientId) ?? null) : null,
    sourceProgramId: r.sourceProgramId,
    workoutDays: days.filter((d) => d.workoutId !== null && d.weekNumber <= r.durationWeeks).length,
    archived: r.archivedAt !== null,
    updatedAt: r.updatedAt.toISOString(),
  }
}

export async function loadProgramDays(db: Db, programIds: number[]) {
  const result = new Map<number, ProgramDay[]>()
  if (programIds.length === 0) return result
  const rows = await db
    .select()
    .from(programDays)
    .where(inArray(programDays.programId, programIds))
    .orderBy(asc(programDays.weekNumber), asc(programDays.dayNumber))
  for (const r of rows) {
    const list = result.get(r.programId) ?? []
    list.push({
      id: r.id,
      weekNumber: r.weekNumber,
      dayNumber: r.dayNumber,
      workoutId: r.workoutId,
      checkinRequired: r.checkinRequired,
      notes: r.notes,
    })
    result.set(r.programId, list)
  }
  return result
}

export async function programDetail(db: Db, row: ProgramRow): Promise<ProgramDetail> {
  const days = ((await loadProgramDays(db, [row.id])).get(row.id) ?? []).filter(
    (d) => d.weekNumber <= row.durationWeeks,
  )
  return { ...toSummary(row, days, await clientNames(db, [row.clientId])), days }
}

/**
 * Makes a client's personal copy of a program and of every workout it uses, so their
 * coach can change it for them without touching the library or anyone else. Returns its id.
 */
export async function copyProgramForClient(
  db: Db,
  programId: number,
  clientId: number,
  actorId: number,
) {
  // Read everything first (a fixed number of queries, however many workouts the program uses).
  const [[source], dayMap] = await Promise.all([
    db.select().from(programs).where(eq(programs.id, programId)),
    loadProgramDays(db, [programId]),
  ])
  if (!source) notFound('Program not found')
  const days = dayMap.get(source.id) ?? []
  const usedIds = [...new Set(days.flatMap((d) => (d.workoutId === null ? [] : [d.workoutId])))]
  const [sourceWorkouts, items, groups] = await Promise.all([
    inChunks(usedIds, (ids) => db.select().from(workouts).where(inArray(workouts.id, ids))),
    inChunks(usedIds, (ids) =>
      db.select().from(workoutExercises).where(inArray(workoutExercises.workoutId, ids)),
    ),
    inChunks(usedIds, (ids) =>
      db.select().from(workoutGroups).where(inArray(workoutGroups.workoutId, ids)),
    ),
  ])
  // Workouts that are already this client's own copies are used as they are.
  const toCopy = sourceWorkouts.filter((w) => w.clientId !== clientId)
  const copyOf = new Map(sourceWorkouts.map((w) => [w.id, w.id]))

  // 1. The program and workout copies, in one batch (all or nothing), to learn their new ids.
  const heads = (await db.batch([
    db
      .insert(programs)
      .values({
        name: source.name,
        description: source.description,
        durationWeeks: source.durationWeeks,
        createdBy: actorId,
        clientId,
        sourceProgramId: source.sourceProgramId ?? source.id,
        syncedAt: new Date(),
      })
      .returning({ id: programs.id }),
    ...toCopy.map((w) =>
      db
        .insert(workouts)
        .values(workoutCopyValues(w, clientId, actorId))
        .returning({ id: workouts.id }),
    ),
  ])) as unknown as { id: number }[][]
  const copyId = heads[0]?.[0]?.id
  if (copyId === undefined) throw new Error('Insert returned no row')
  const created: number[] = []
  toCopy.forEach((w, i) => {
    const id = heads[i + 1]?.[0]?.id
    if (id === undefined) throw new Error('Insert returned no row')
    copyOf.set(w.id, id)
    created.push(id)
  })

  // 2. Everything inside them, in a second batch. If that fails, step 1 is undone, so a
  // half-way failure never leaves empty copies behind.
  const copied = new Set(toCopy.map((w) => w.id))
  const into = (workoutId: number) => copyOf.get(workoutId) ?? workoutId
  try {
    await runAll(db, [
      ...insertMany(
        db,
        workoutExercises,
        items
          .filter((r) => copied.has(r.workoutId))
          .map(({ id: _id, ...r }) => ({ ...r, workoutId: into(r.workoutId) })),
      ),
      ...insertMany(
        db,
        workoutGroups,
        groups
          .filter((r) => copied.has(r.workoutId))
          .map(({ id: _id, ...r }) => ({ ...r, workoutId: into(r.workoutId) })),
      ),
      ...insertMany(
        db,
        programDays,
        days.map((d) => ({
          programId: copyId,
          weekNumber: d.weekNumber,
          dayNumber: d.dayNumber,
          workoutId: d.workoutId === null ? null : (copyOf.get(d.workoutId) ?? null),
          checkinRequired: d.checkinRequired,
          notes: d.notes,
        })),
      ),
    ])
  } catch (err) {
    // Deleting the copies takes their days, rows and groups with them.
    await db.batch([
      db.delete(programs).where(eq(programs.id, copyId)),
      ...(created.length ? [db.delete(workouts).where(inArray(workouts.id, created))] : []),
    ])
    throw err
  }
  return copyId
}

/**
 * Deletes a client's personal program copy (and its workouts that nothing else uses)
 * once no enrollment points at it. Library programs are never touched.
 */
export async function deleteClientProgram(db: Db, programId: number) {
  const [row] = await db
    .select({ clientId: programs.clientId })
    .from(programs)
    .where(eq(programs.id, programId))
  if (!row || row.clientId === null) return
  const [inUse] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(eq(enrollments.programId, programId))
    .limit(1)
  if (inUse) return
  const workoutIds = [
    ...new Set(
      ((await loadProgramDays(db, [programId])).get(programId) ?? [])
        .map((d) => d.workoutId)
        .filter((v): v is number => v !== null),
    ),
  ]
  // Program days go with the program (ON DELETE CASCADE).
  await db.delete(programs).where(eq(programs.id, programId))
  await deleteUnusedClientWorkouts(db, workoutIds, row.clientId)
}

/** Deletes these workout copies of a client's when no program day or session uses them any more. */
async function deleteUnusedClientWorkouts(db: Db, workoutIds: number[], clientId: number) {
  if (workoutIds.length === 0) return
  await db
    .delete(workouts)
    .where(
      and(
        inArray(workouts.id, workoutIds),
        eq(workouts.clientId, clientId),
        notExists(
          db.select({ x: sql`1` }).from(programDays).where(eq(programDays.workoutId, workouts.id)),
        ),
        notExists(
          db
            .select({ x: sql`1` })
            .from(workoutSessions)
            .where(eq(workoutSessions.workoutId, workouts.id)),
        ),
      ),
    )
}

export async function findVisibleProgram(
  db: Db,
  user: Me,
  id: number,
  archived: boolean | 'any' = 'any',
) {
  const [row] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, id), visibleTo(programs, user, archived)))
    .limit(1)
  if (!row) notFound('Program not found')
  return row
}

async function assertWorkoutsUsable(db: Db, user: Me, input: ProgramInputParsed) {
  const ids = [
    ...new Set(input.days.map((d) => d.workoutId).filter((v): v is number => v !== null)),
  ]
  if (ids.length === 0) return
  const found = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(inArray(workouts.id, ids), visibleTo(workouts, user, 'any')))
  if (found.length !== ids.length)
    throw new HTTPException(400, { message: 'Unknown workout in program' })
}

/**
 * Saves the grid. Day rows are updated in place (never deleted) because
 * logged sessions point at them; a slot left out becomes a rest day.
 */
async function writeDays(db: Db, programId: number, input: Pick<ProgramInputParsed, 'days'>) {
  const slots = new Map(input.days.map((d) => [`${d.weekNumber}:${d.dayNumber}`, d]))
  const existing = (await loadProgramDays(db, [programId])).get(programId) ?? []
  const statements = []
  for (const row of existing) {
    if (
      !slots.has(`${row.weekNumber}:${row.dayNumber}`) &&
      (row.workoutId !== null || row.checkinRequired)
    ) {
      statements.push(
        db
          .update(programDays)
          .set({ workoutId: null, checkinRequired: false, notes: null })
          .where(eq(programDays.id, row.id)),
      )
    }
  }
  for (const d of slots.values()) {
    statements.push(
      db
        .insert(programDays)
        .values({
          programId,
          weekNumber: d.weekNumber,
          dayNumber: d.dayNumber,
          workoutId: d.workoutId,
          checkinRequired: d.checkinRequired,
          notes: d.notes ?? null,
        })
        .onConflictDoUpdate({
          target: [programDays.programId, programDays.weekNumber, programDays.dayNumber],
          set: {
            workoutId: d.workoutId,
            checkinRequired: d.checkinRequired,
            notes: d.notes ?? null,
          },
        }),
    )
  }
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
}

/**
 * Brings a client's copy up to date with the library program it came from: name, length,
 * schedule and every workout. It stays the same program (same enrollment, start date and
 * program days), so their calendar, progress and history carry on. Their workout copies are
 * rewritten in place; logged sessions keep their own snapshot of what was prescribed.
 */
export async function syncClientCopy(db: Db, copyId: number, actorId: number) {
  const [copy] = await db.select().from(programs).where(eq(programs.id, copyId))
  if (!copy || copy.clientId === null || copy.sourceProgramId === null)
    notFound('Program not found')
  const clientId = copy.clientId
  const [source] = await db.select().from(programs).where(eq(programs.id, copy.sourceProgramId))
  if (!source) notFound('The library program is gone')
  const days = await loadProgramDays(db, [source.id, copy.id])
  const sourceDays = days.get(source.id) ?? []
  const oldIds = [
    ...new Set((days.get(copy.id) ?? []).map((d) => d.workoutId).filter((v) => v !== null)),
  ]
  // Their workout copies, by the library workout each was made from.
  const theirs = new Map<number, number>()
  if (oldIds.length > 0) {
    const rows = await db
      .select({ id: workouts.id, sourceWorkoutId: workouts.sourceWorkoutId })
      .from(workouts)
      .where(and(inArray(workouts.id, oldIds), eq(workouts.clientId, clientId)))
    for (const w of rows)
      if (w.sourceWorkoutId !== null && !theirs.has(w.sourceWorkoutId))
        theirs.set(w.sourceWorkoutId, w.id)
  }
  const map = new Map<number, number>()
  for (const d of sourceDays) {
    if (d.workoutId === null || map.has(d.workoutId)) continue
    const mine = theirs.get(d.workoutId)
    if (mine !== undefined) await overwriteWorkoutCopy(db, d.workoutId, mine)
    map.set(d.workoutId, mine ?? (await copyWorkoutForClient(db, d.workoutId, clientId, actorId)))
  }
  await writeDays(db, copy.id, {
    days: sourceDays.map((d) => ({
      weekNumber: d.weekNumber,
      dayNumber: d.dayNumber,
      workoutId: d.workoutId === null ? null : (map.get(d.workoutId) ?? null),
      checkinRequired: d.checkinRequired,
      notes: d.notes,
    })),
  })
  await db
    .update(programs)
    .set({
      name: source.name,
      description: source.description,
      durationWeeks: source.durationWeeks,
      syncedAt: new Date(),
    })
    .where(eq(programs.id, copy.id))
  const used = new Set(map.values())
  await deleteUnusedClientWorkouts(
    db,
    oldIds.filter((w) => !used.has(w)),
    clientId,
  )
}

/** Edits this soon after a copy is made or updated are part of that, not a change for them. */
const SYNC_SLACK_MS = 1000

/** The people `user` manages who are on a copy of this library program, and how each stands. */
export async function programCopies(
  db: Db,
  user: Me,
  libraryId: number,
): Promise<ProgramCopySummary[]> {
  const [[library], [libraryWorkouts], rows] = await Promise.all([
    db.select({ updatedAt: programs.updatedAt }).from(programs).where(eq(programs.id, libraryId)),
    db
      .select({ at: max(workouts.updatedAt) })
      .from(programDays)
      .innerJoin(workouts, eq(workouts.id, programDays.workoutId))
      .where(eq(programDays.programId, libraryId)),
    db
      .select({
        enrollmentId: enrollments.id,
        userId: users.id,
        userName: users.name,
        programId: programs.id,
        startDate: enrollments.startDate,
        createdAt: programs.createdAt,
        updatedAt: programs.updatedAt,
        syncedAt: programs.syncedAt,
      })
      .from(enrollments)
      .innerJoin(programs, eq(programs.id, enrollments.programId))
      .innerJoin(users, eq(users.id, enrollments.userId))
      .where(
        and(
          eq(enrollments.status, 'active'),
          eq(programs.sourceProgramId, libraryId),
          managedUsers(user),
        ),
      )
      .orderBy(asc(users.name)),
  ])
  if (!library) return []
  const copyWorkouts = new Map<number, Date | null>()
  if (rows.length > 0) {
    const edits = await db
      .select({ programId: programDays.programId, at: max(workouts.updatedAt) })
      .from(programDays)
      .innerJoin(workouts, eq(workouts.id, programDays.workoutId))
      .where(
        inArray(
          programDays.programId,
          rows.map((r) => r.programId),
        ),
      )
      .groupBy(programDays.programId)
    for (const e of edits) copyWorkouts.set(e.programId, e.at)
  }
  const libraryChanged = Math.max(library.updatedAt.getTime(), libraryWorkouts?.at?.getTime() ?? 0)
  return rows.map((r) => {
    const base = (r.syncedAt ?? r.createdAt).getTime()
    const theirEdit = Math.max(r.updatedAt.getTime(), copyWorkouts.get(r.programId)?.getTime() ?? 0)
    return {
      enrollmentId: r.enrollmentId,
      userId: r.userId,
      userName: r.userName,
      programId: r.programId,
      startDate: r.startDate,
      behind: libraryChanged > base,
      changedForThem: theirEdit > base + SYNC_SLACK_MS,
    }
  })
}

/** In a client's copy, every workout must be theirs too: library workouts dropped in are copied for them. */
async function ownWorkouts(db: Db, input: ProgramInputParsed, clientId: number, actorId: number) {
  const ids = [
    ...new Set(input.days.map((d) => d.workoutId).filter((v): v is number => v !== null)),
  ]
  if (ids.length === 0) return input
  const rows = await db
    .select({ id: workouts.id, clientId: workouts.clientId })
    .from(workouts)
    .where(inArray(workouts.id, ids))
  const map = new Map<number, number>()
  for (const r of rows)
    map.set(
      r.id,
      r.clientId === clientId ? r.id : await copyWorkoutForClient(db, r.id, clientId, actorId),
    )
  return {
    ...input,
    days: input.days.map((d) => ({
      ...d,
      workoutId: d.workoutId === null ? null : (map.get(d.workoutId) ?? d.workoutId),
    })),
  }
}

function programValues(input: ProgramInputParsed) {
  return {
    name: input.name,
    description: input.description ?? null,
    durationWeeks: input.durationWeeks,
  }
}

export const programRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  /** The library (clients' personal copies are left out; they live on each person). */
  .get('/', async (c) => {
    const archived = c.req.query('archived') === '1'
    const rows = await c.var.db
      .select()
      .from(programs)
      .where(and(visibleTo(programs, c.var.user, archived), libraryOnly(programs)))
      .orderBy(asc(programs.name))
    const days = await loadProgramDays(
      c.var.db,
      rows.map((r) => r.id),
    )
    return c.json({ programs: rows.map((r) => toSummary(r, days.get(r.id) ?? [], new Map())) })
  })
  .get('/:id', async (c) => {
    const row = await findVisibleProgram(c.var.db, c.var.user, parseId(c.req.param('id')))
    return c.json({ program: await programDetail(c.var.db, row) })
  })
  .post('/', async (c) => {
    const input = await parseBody(c.req.raw, programInput)
    await assertWorkoutsUsable(c.var.db, c.var.user, input)
    const [row] = await c.var.db
      .insert(programs)
      .values({ ...programValues(input), createdBy: c.var.user.id })
      .returning()
    if (!row) throw new Error('Insert returned no row')
    await writeDays(c.var.db, row.id, input)
    return c.json({ program: await programDetail(c.var.db, row) }, 201)
  })
  .put('/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisibleProgram(c.var.db, c.var.user, id)
    await assertCanEditItem(c.var.db, c.var.user, existing)
    const parsed = await parseBody(c.req.raw, programInput)
    await assertWorkoutsUsable(c.var.db, c.var.user, parsed)
    const input =
      existing.clientId === null
        ? parsed
        : await ownWorkouts(c.var.db, parsed, existing.clientId, c.var.user.id)
    const [row] = await c.var.db
      .update(programs)
      .set(programValues(input))
      .where(eq(programs.id, id))
      .returning()
    await writeDays(c.var.db, id, input)
    return c.json({ program: await programDetail(c.var.db, row ?? existing) })
  })
  .delete('/:id', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisibleProgram(c.var.db, c.var.user, id, false)
    await assertCanEditItem(c.var.db, c.var.user, existing)
    await c.var.db.update(programs).set({ archivedAt: new Date() }).where(eq(programs.id, id))
    return c.body(null, 204)
  })
  /** People on their own copy of this library program, and whether each copy is behind. */
  .get('/:id/copies', async (c) => {
    const row = await findVisibleProgram(c.var.db, c.var.user, parseId(c.req.param('id')))
    if (row.clientId !== null) return c.json({ copies: [] })
    return c.json({ copies: await programCopies(c.var.db, c.var.user, row.id) })
  })
  /** Bring these people's copies up to date with this library program (progress is kept). */
  .post('/:id/sync', async (c) => {
    const { db, user } = c.var
    const row = await findVisibleProgram(db, user, parseId(c.req.param('id')))
    const { enrollmentIds } = await parseBody(c.req.raw, syncCopiesInput)
    const targets = await db
      .select({ userId: enrollments.userId, programId: enrollments.programId })
      .from(enrollments)
      .innerJoin(programs, eq(programs.id, enrollments.programId))
      .where(
        and(
          inArray(enrollments.id, enrollmentIds),
          eq(enrollments.status, 'active'),
          eq(programs.sourceProgramId, row.id),
        ),
      )
    if (targets.length !== new Set(enrollmentIds).size) notFound('Enrollment not found')
    for (const t of targets) await managedPerson(db, user, t.userId)
    for (const t of targets) await syncClientCopy(db, t.programId, user.id)
    return c.json({ copies: await programCopies(db, user, row.id) })
  })
  .get('/:id/impact', async (c) => {
    const id = parseId(c.req.param('id'))
    await findVisibleProgram(c.var.db, c.var.user, id)
    return c.json({ impact: await programImpact(c.var.db, c.var.user, id) })
  })
  /** Delete for good: schedule, assignments and the sessions logged as part of it. */
  .delete('/:id/permanent', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisibleProgram(c.var.db, c.var.user, id)
    await assertCanEditItem(c.var.db, c.var.user, existing)
    await purgeProgram(c.var.db, c.var.user, id)
    return c.body(null, 204)
  })
  .post('/:id/restore', async (c) => {
    const id = parseId(c.req.param('id'))
    const existing = await findVisibleProgram(c.var.db, c.var.user, id, true)
    await assertCanEditItem(c.var.db, c.var.user, existing)
    const [row] = await c.var.db
      .update(programs)
      .set({ archivedAt: null })
      .where(eq(programs.id, id))
      .returning()
    return c.json({ program: await programDetail(c.var.db, row ?? existing) })
  })
