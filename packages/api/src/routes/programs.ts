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
import { and, asc, count, eq, inArray, isNotNull, lte, max, notExists, or, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { alias } from 'drizzle-orm/sqlite-core'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { managedUsers } from '../access'
import { chunk, inChunks, insertMany, runAll } from '../batch'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId } from '../errors'
import { assertCanEditItem, libraryOnly, visibleTo } from '../library'
import { requireAdmin, requireUser } from '../middleware'
import { programImpact, purgeProgram } from '../purge'
import { pushLater } from '../push'
import {
  clientNames,
  copyWorkoutForClient,
  workoutCopyValues,
} from './workouts'

type ProgramRow = typeof programs.$inferSelect
type ProgramInputParsed = ReturnType<typeof programInput.parse>

function toSummary(r: ProgramRow, workoutDays: number, names: Map<number, string>): ProgramSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    durationWeeks: r.durationWeeks,
    createdBy: r.createdBy,
    clientId: r.clientId,
    clientName: r.clientId !== null ? (names.get(r.clientId) ?? null) : null,
    sourceProgramId: r.sourceProgramId,
    workoutDays,
    archived: r.archivedAt !== null,
    updatedAt: r.updatedAt.toISOString(),
  }
}

export async function loadProgramDays(db: Db, programIds: number[]) {
  const result = new Map<number, ProgramDay[]>()
  if (programIds.length === 0) return result
  // In slices: D1 allows 100 bound values per statement.
  const rows = await inChunks(programIds, (ids) =>
    db
      .select()
      .from(programDays)
      .where(inArray(programDays.programId, ids))
      .orderBy(asc(programDays.weekNumber), asc(programDays.dayNumber)),
  )
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
  const workoutDays = days.filter(
    (d) => d.workoutId !== null && d.weekNumber <= row.durationWeeks,
  ).length
  return { ...toSummary(row, workoutDays, await clientNames(db, [row.clientId])), days }
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
      ...chunk(created).map((ids) => db.delete(workouts).where(inArray(workouts.id, ids))),
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
  await runAll(db, unusedClientWorkouts(db, workoutIds, clientId))
}

/** The same as batch statements, one per slice of ids (D1's 100-value limit). */
function unusedClientWorkouts(
  db: Db,
  workoutIds: number[],
  clientId: number,
): BatchItem<'sqlite'>[] {
  return chunk(workoutIds).map((ids) =>
    db
      .delete(workouts)
      .where(
        and(
          inArray(workouts.id, ids),
          eq(workouts.clientId, clientId),
          notExists(
            db
              .select({ x: sql`1` })
              .from(programDays)
              .where(eq(programDays.workoutId, workouts.id)),
          ),
          notExists(
            db
              .select({ x: sql`1` })
              .from(workoutSessions)
              .where(eq(workoutSessions.workoutId, workouts.id)),
          ),
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
  await syncClientCopies(db, [copyId], actorId)
}

/**
 * The same for many clients' copies at once, in a fixed number of round trips however many
 * clients or workouts: read everything, make the new workout copies in one batch (to learn
 * their ids), then write the rest in one batch. If that second batch fails, the new copies
 * are removed again, so every client ends up either fully updated or untouched.
 */
export async function syncClientCopies(db: Db, copyIds: number[], actorId: number) {
  const ids = [...new Set(copyIds)]
  if (ids.length === 0) return
  // 1. Read: the copies and the library programs they came from.
  const copies = await inChunks(ids, (slice) =>
    db.select().from(programs).where(inArray(programs.id, slice)),
  )
  if (copies.length !== ids.length) notFound('Program not found')
  for (const copy of copies)
    if (copy.clientId === null || copy.sourceProgramId === null) notFound('Program not found')
  const sourceIds = [...new Set(copies.map((c) => c.sourceProgramId as number))]
  const [sources, days] = await Promise.all([
    inChunks(sourceIds, (slice) => db.select().from(programs).where(inArray(programs.id, slice))),
    loadProgramDays(db, [...sourceIds, ...ids]),
  ])
  if (sources.length !== sourceIds.length) notFound('The library program is gone')
  const sourceOf = new Map(sources.map((s) => [s.id, s]))

  // The library workouts the schedules use, and every client's current workout copies.
  const usedIds = [
    ...new Set(
      sourceIds.flatMap((id) =>
        (days.get(id) ?? []).flatMap((d) => (d.workoutId === null ? [] : [d.workoutId])),
      ),
    ),
  ]
  const oldIds = [
    ...new Set(
      ids.flatMap((id) =>
        (days.get(id) ?? []).flatMap((d) => (d.workoutId === null ? [] : [d.workoutId])),
      ),
    ),
  ]
  const [libraryWorkouts, items, groups, current] = await Promise.all([
    inChunks(usedIds, (slice) => db.select().from(workouts).where(inArray(workouts.id, slice))),
    inChunks(usedIds, (slice) =>
      db.select().from(workoutExercises).where(inArray(workoutExercises.workoutId, slice)),
    ),
    inChunks(usedIds, (slice) =>
      db.select().from(workoutGroups).where(inArray(workoutGroups.workoutId, slice)),
    ),
    inChunks(oldIds, (slice) =>
      db
        .select({
          id: workouts.id,
          clientId: workouts.clientId,
          sourceWorkoutId: workouts.sourceWorkoutId,
        })
        .from(workouts)
        .where(inArray(workouts.id, slice)),
    ),
  ])
  const workoutOf = new Map(libraryWorkouts.map((w) => [w.id, w]))
  const itemsOf = groupBy(items, (r) => r.workoutId)
  const groupsOf = groupBy(groups, (r) => r.workoutId)

  // 2. Plan each client's copy: which workout copies to rewrite and which to make.
  const plans = copies.map((copy) => {
    const clientId = copy.clientId as number
    const source = sourceOf.get(copy.sourceProgramId as number)
    if (!source) notFound('The library program is gone')
    const mineNow = new Set(
      (days.get(copy.id) ?? []).flatMap((d) => (d.workoutId === null ? [] : [d.workoutId])),
    )
    // Their workout copies on this program, by the library workout each was made from.
    const theirs = new Map<number, number>()
    for (const w of current)
      if (mineNow.has(w.id) && w.clientId === clientId && w.sourceWorkoutId !== null)
        if (!theirs.has(w.sourceWorkoutId)) theirs.set(w.sourceWorkoutId, w.id)
    const sourceDays = days.get(source.id) ?? []
    const libraryIds = [
      ...new Set(sourceDays.flatMap((d) => (d.workoutId === null ? [] : [d.workoutId]))),
    ]
    for (const id of libraryIds) if (!workoutOf.has(id)) notFound('Workout not found')
    return {
      copy,
      clientId,
      source,
      sourceDays,
      oldIds: [...mineNow],
      rewrite: libraryIds.flatMap((id) => {
        const to = theirs.get(id)
        return to === undefined ? [] : [{ from: id, to }]
      }),
      create: libraryIds.filter((id) => !theirs.has(id)),
    }
  })

  // 3. New workout copies, in one batch, to learn their ids.
  const toCreate = plans.flatMap((p) =>
    p.create.map((from) => ({ plan: p, from, source: workoutOf.get(from) as WorkoutRow })),
  )
  const createdIds: number[] = []
  try {
  for (const part of chunkList(toCreate, 500)) {
    const [first, ...rest] = part.map((t) =>
      db
        .insert(workouts)
        .values(workoutCopyValues(t.source, t.plan.clientId, actorId))
        .returning({ id: workouts.id }),
    )
    if (!first) continue
    const made = (await db.batch([first, ...rest])) as Array<Array<{ id: number }>>
    createdIds.push(...made.map((r) => r[0]?.id as number))
  }
  const newCopyOf = new Map<string, number>()
  toCreate.forEach((t, i) => {
    newCopyOf.set(`${t.plan.copy.id}:${t.from}`, createdIds[i] as number)
  })

  // 4. Everything else in one batch: workout contents, schedules, names, leftovers.
  const rowsFor = (from: number, to: number) => [
    ...insertMany(
      db,
      workoutExercises,
      (itemsOf.get(from) ?? []).map(({ id: _id, ...r }) => ({ ...r, workoutId: to })),
    ),
    ...insertMany(
      db,
      workoutGroups,
      (groupsOf.get(from) ?? []).map(({ id: _id, ...r }) => ({ ...r, workoutId: to })),
    ),
  ]
  const statements: BatchItem<'sqlite'>[] = []
  const now = new Date()
  for (const p of plans) {
    const map = new Map<number, number>()
    for (const { from, to } of p.rewrite) {
      const source = workoutOf.get(from) as WorkoutRow
      map.set(from, to)
      statements.push(
        db
          .update(workouts)
          .set({
            name: source.name,
            description: source.description,
            estimatedMinutes: source.estimatedMinutes,
          })
          .where(eq(workouts.id, to)),
        db.delete(workoutExercises).where(eq(workoutExercises.workoutId, to)),
        db.delete(workoutGroups).where(eq(workoutGroups.workoutId, to)),
        ...rowsFor(from, to),
      )
    }
    for (const from of p.create) {
      const to = newCopyOf.get(`${p.copy.id}:${from}`) as number
      map.set(from, to)
      statements.push(...rowsFor(from, to))
    }
    statements.push(
      ...dayStatements(db, p.copy.id, p.source.id, p.sourceDays, map),
      db
        .update(programs)
        .set({
          name: p.source.name,
          description: p.source.description,
          durationWeeks: p.source.durationWeeks,
          syncedAt: now,
        })
        .where(eq(programs.id, p.copy.id)),
      ...unusedClientWorkouts(
        db,
        p.oldIds.filter((w) => !new Set(map.values()).has(w)),
        p.clientId,
      ),
    )
  }
    await runAll(db, statements)
  } catch (err) {
    // Take back the copies made in step 3 (their rows and groups go with them).
    if (createdIds.length > 0)
      await runAll(
        db,
        chunk(createdIds).map((slice) => db.delete(workouts).where(inArray(workouts.id, slice))),
      )
    throw err
  }
}

type WorkoutRow = typeof workouts.$inferSelect

function groupBy<T>(rows: T[], key: (row: T) => number) {
  const out = new Map<number, T[]>()
  for (const r of rows) {
    const list = out.get(key(r)) ?? []
    list.push(r)
    out.set(key(r), list)
  }
  return out
}

function chunkList<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * A copy's schedule made to match its library program, as batch statements. Day rows are
 * updated in place (sessions point at them): every library slot is written (several rows per
 * statement), and a slot the library no longer has becomes a rest day.
 */
function dayStatements(
  db: Db,
  copyId: number,
  sourceId: number,
  sourceDays: ProgramDay[],
  workoutMap: Map<number, number>,
): BatchItem<'sqlite'>[] {
  const source = alias(programDays, 'source')
  const statements: BatchItem<'sqlite'>[] = [
    db
      .update(programDays)
      .set({ workoutId: null, checkinRequired: false, notes: null })
      .where(
        and(
          eq(programDays.programId, copyId),
          or(isNotNull(programDays.workoutId), eq(programDays.checkinRequired, true)),
          notExists(
            db
              .select({ x: sql`1` })
              .from(source)
              .where(
                and(
                  eq(source.programId, sourceId),
                  eq(source.weekNumber, programDays.weekNumber),
                  eq(source.dayNumber, programDays.dayNumber),
                ),
              ),
          ),
        ),
      ),
  ]
  const rows = sourceDays.map((d) => ({
    programId: copyId,
    weekNumber: d.weekNumber,
    dayNumber: d.dayNumber,
    workoutId: d.workoutId === null ? null : (workoutMap.get(d.workoutId) ?? null),
    checkinRequired: d.checkinRequired,
    notes: d.notes ?? null,
  }))
  // 6 values per row: 16 rows per statement stays under D1's 100.
  for (const part of chunkList(rows, 16)) {
    statements.push(
      db
        .insert(programDays)
        .values(part)
        .onConflictDoUpdate({
          target: [programDays.programId, programDays.weekNumber, programDays.dayNumber],
          set: {
            workoutId: sql`excluded.workout_id`,
            checkinRequired: sql`excluded.checkin_required`,
            notes: sql`excluded.notes`,
          },
        }),
    )
  }
  return statements
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
    const edits = await inChunks(
      rows.map((r) => r.programId),
      (ids) =>
        db
          .select({ programId: programDays.programId, at: max(workouts.updatedAt) })
          .from(programDays)
          .innerJoin(workouts, eq(workouts.id, programDays.workoutId))
          .where(inArray(programDays.programId, ids))
          .groupBy(programDays.programId),
    )
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
  const rows = await inChunks(ids, (slice) =>
    db
      .select({ id: workouts.id, clientId: workouts.clientId })
      .from(workouts)
      .where(inArray(workouts.id, slice)),
  )
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
    // Workout days per program, counted in SQL (not every day of every program loaded).
    const counts = await inChunks(
      rows.map((r) => r.id),
      (ids) =>
        c.var.db
          .select({ programId: programDays.programId, n: count() })
          .from(programDays)
          .innerJoin(programs, eq(programs.id, programDays.programId))
          .where(
            and(
              inArray(programDays.programId, ids),
              isNotNull(programDays.workoutId),
              lte(programDays.weekNumber, programs.durationWeeks),
            ),
          )
          .groupBy(programDays.programId),
    )
    const countOf = new Map(counts.map((r) => [r.programId, r.n]))
    return c.json({
      programs: rows.map((r) => toSummary(r, countOf.get(r.id) ?? 0, new Map())),
    })
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
    const targets = await inChunks([...new Set(enrollmentIds)], (ids) =>
      db
        .select({ userId: enrollments.userId, programId: enrollments.programId })
        .from(enrollments)
        .innerJoin(programs, eq(programs.id, enrollments.programId))
        .where(
          and(
            inArray(enrollments.id, ids),
            eq(enrollments.status, 'active'),
            eq(programs.sourceProgramId, row.id),
          ),
        ),
    )
    if (targets.length !== new Set(enrollmentIds).size) notFound('Enrollment not found')
    // Every one of them must be someone you manage (one query, not one per person).
    const people = [...new Set(targets.map((t) => t.userId))]
    const managed = await inChunks(people, (slice) =>
      db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, slice), managedUsers(user))),
    )
    if (managed.length !== people.length) notFound('Enrollment not found')
    await syncClientCopies(
      db,
      targets.map((t) => t.programId),
      user.id,
    )
    await pushLater(
      c,
      targets.map((t) => t.userId),
      {
        title: 'Your program was updated',
        body: `${user.name.split(' ')[0]} made changes to ${row.name}.`,
        url: '/calendar',
        tag: 'program',
      },
    )
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
    await purgeProgram(c.var.db, id)
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
