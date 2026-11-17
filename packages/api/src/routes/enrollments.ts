import { type Db, enrollments, programs, users } from '@project180/db'
import {
  assignInput,
  ENROLLMENT_STATUS,
  type EnrollmentStatus,
  type EnrollmentSummary,
  formatDay,
  type Me,
  queuesBehind,
  todayIn,
} from '@project180/shared'
import { and, desc, eq, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { coachedPerson, coachedUsers } from '../access'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import { pushLater } from '../push'
import { copyProgramForClient, findVisibleProgram, syncClientCopy } from './programs'

const summaryColumns = {
  id: enrollments.id,
  userId: enrollments.userId,
  userName: users.name,
  programId: enrollments.programId,
  programName: programs.name,
  sourceProgramId: programs.sourceProgramId,
  durationWeeks: programs.durationWeeks,
  startDate: enrollments.startDate,
  status: enrollments.status,
}

export function enrollmentQuery(db: Db) {
  return db
    .select(summaryColumns)
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .innerJoin(programs, eq(programs.id, enrollments.programId))
}

const activeFor = (db: Db, userId: number) =>
  enrollmentQuery(db)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, 'active')))
    .limit(1)

/**
 * Puts someone on a program from a start date. They get their own copy (so their coach can
 * tweak it without touching anyone else's).
 * - Starting today or earlier (or with no current program): it replaces the current one now.
 * - Starting later while a current program runs: it waits in the queue (`scheduled`) and takes
 *   over on its start date (schedule.ts). The current program and its history stay until then.
 * `update`: they're already on this program, so bring their copy up to date instead and keep
 * their start date and progress.
 */
export async function assignProgram(
  db: Db,
  actor: Me,
  userId: number,
  programId: number,
  startDate: string,
  mode: 'restart' | 'update' = 'restart',
  /** A program already checked by the caller (a starter program someone picked themselves). */
  found?: Awaited<ReturnType<typeof findVisibleProgram>>,
) {
  const program = found ?? (await findVisibleProgram(db, actor, programId, false))
  if (mode === 'update') {
    const [current] = await activeFor(db, userId)
    if (!current || program.clientId !== null || current.sourceProgramId !== program.id)
      throw new HTTPException(409, { message: 'They aren’t on this program now.' })
    await syncClientCopy(db, current.programId, actor.id)
    const [row] = await activeFor(db, userId)
    return row
  }
  const [[current], [person]] = await Promise.all([
    activeFor(db, userId),
    db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)),
  ])
  const queue = queuesBehind(current, startDate, todayIn(person?.timezone ?? 'Africa/Johannesburg'))
  if (queue) {
    const [clash] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, userId),
          eq(enrollments.status, 'scheduled'),
          eq(enrollments.startDate, startDate),
        ),
      )
    if (clash)
      throw new HTTPException(409, {
        message: `A program already starts on ${formatDay(startDate)}. Pick another day or remove that one first.`,
      })
  }
  const copyId =
    program.clientId === userId
      ? program.id
      : await copyProgramForClient(db, program.id, userId, actor.id)
  if (queue) {
    const [queued] = await db
      .insert(enrollments)
      .values({ userId, programId: copyId, startDate, status: 'scheduled', assignedBy: actor.id })
      .returning({ id: enrollments.id })
    const [row] = await enrollmentQuery(db).where(eq(enrollments.id, queued?.id ?? 0))
    return row
  }
  await db.batch([
    db
      .update(enrollments)
      .set({ status: 'cancelled' })
      .where(and(eq(enrollments.userId, userId), eq(enrollments.status, 'active'))),
    db
      .insert(enrollments)
      .values({ userId, programId: copyId, startDate, status: 'active', assignedBy: actor.id }),
  ])
  const [row] = await activeFor(db, userId)
  return row
}

export const enrollmentRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get('/', async (c) => {
    const { user, db } = c.var
    const programId = c.req.query('programId')
    // ?status=active: only current programs (what every screen shows), not the whole history.
    const status = c.req.query('status')
    const filters = [
      coachedUsers(user),
      // ?mine=1: only you and the clients you coach yourself (the overview), owners included.
      c.req.query('mine') === '1'
        ? or(eq(users.id, user.id), eq(users.coachId, user.id))
        : undefined,
      status && (ENROLLMENT_STATUS as readonly string[]).includes(status)
        ? eq(enrollments.status, status as EnrollmentStatus)
        : undefined,
      // A library program: its own enrollments plus everyone's personal copies of it.
      programId
        ? or(
            eq(enrollments.programId, Number(programId)),
            eq(programs.sourceProgramId, Number(programId)),
          )
        : undefined,
    ]
    const rows: EnrollmentSummary[] = await enrollmentQuery(db)
      .where(and(...filters))
      .orderBy(desc(enrollments.createdAt))
    return c.json({ enrollments: rows })
  })
  /** Assign a program: only to yourself or a client you coach (owners too). Clients never assign. */
  .post('/', async (c) => {
    const { user, db } = c.var
    const input = await parseBody(c.req.raw, assignInput)
    await coachedPerson(db, user, input.userId)
    const row = await assignProgram(
      db,
      user,
      input.userId,
      input.programId,
      input.startDate,
      input.mode,
    )
    // Tell their phone (if they turned notifications on); the bell in the app shows it too.
    if (row)
      await pushLater(
        c,
        [input.userId],
        row.status === 'scheduled'
          ? {
              title: `Next program: ${row.programName}`,
              body: `${user.name.split(' ')[0]} lined it up for you. It starts ${formatDay(row.startDate)}.`,
              url: '/calendar',
              tag: 'program',
            }
          : input.mode === 'update'
            ? {
                title: 'Your program was updated',
                body: `${user.name.split(' ')[0]} made changes to ${row.programName}.`,
                url: '/calendar',
                tag: 'program',
              }
            : {
                title: `New program: ${row.programName}`,
                body: `${user.name.split(' ')[0]} set it up for you. Open the app to see your plan.`,
                url: '/calendar',
                tag: 'program',
              },
      )
    return c.json({ enrollment: row }, input.mode === 'update' ? 200 : 201)
  })
  .delete('/:id', async (c) => {
    const { user, db } = c.var
    const id = parseId(c.req.param('id'))
    const [row] = await db.select().from(enrollments).where(eq(enrollments.id, id))
    if (!row) notFound('Enrollment not found')
    await coachedPerson(db, user, row.userId)
    await db.update(enrollments).set({ status: 'cancelled' }).where(eq(enrollments.id, id))
    return c.body(null, 204)
  })
