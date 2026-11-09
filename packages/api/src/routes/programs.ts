import {
  type Db,
  enrollments,
  programDays,
  programs,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  type Me,
  type ProgramDay,
  type ProgramDetail,
  type ProgramSummary,
  programInput,
} from '@project180/shared'
import { and, asc, eq, inArray, notExists, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { insertMany, runAll } from '../batch'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId } from '../errors'
import { assertCanEditItem, libraryOnly, visibleTo } from '../library'
import { requireAdmin, requireUser } from '../middleware'
import { programImpact, purgeProgram } from '../purge'
import { clientNames, copyWorkoutForClient } from './workouts'

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
  const [source] = await db.select().from(programs).where(eq(programs.id, programId))
  if (!source) notFound('Program not found')
  const days = (await loadProgramDays(db, [source.id])).get(source.id) ?? []
  const workoutIds = new Map<number, number>()
  for (const d of days) {
    if (d.workoutId !== null && !workoutIds.has(d.workoutId)) {
      workoutIds.set(d.workoutId, await copyWorkoutForClient(db, d.workoutId, clientId, actorId))
    }
  }
  const [copy] = await db
    .insert(programs)
    .values({
      name: source.name,
      description: source.description,
      durationWeeks: source.durationWeeks,
      createdBy: actorId,
      clientId,
      sourceProgramId: source.sourceProgramId ?? source.id,
    })
    .returning({ id: programs.id })
  if (!copy) throw new Error('Insert returned no row')
  await runAll(
    db,
    insertMany(
      db,
      programDays,
      days.map((d) => ({
        programId: copy.id,
        weekNumber: d.weekNumber,
        dayNumber: d.dayNumber,
        workoutId: d.workoutId === null ? null : (workoutIds.get(d.workoutId) ?? null),
        checkinRequired: d.checkinRequired,
        notes: d.notes,
      })),
    ),
  )
  return copy.id
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
  if (workoutIds.length === 0) return
  await db
    .delete(workouts)
    .where(
      and(
        inArray(workouts.id, workoutIds),
        eq(workouts.clientId, row.clientId),
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
async function writeDays(db: Db, programId: number, input: ProgramInputParsed) {
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
