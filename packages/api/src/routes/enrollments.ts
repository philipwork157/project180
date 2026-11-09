import { type Db, enrollments, programs, users } from '@project180/db'
import { assignInput, type EnrollmentSummary, type Me } from '@project180/shared'
import { and, desc, eq, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { managedPerson, managedUsers } from '../access'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import { copyProgramForClient, findVisibleProgram } from './programs'

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

/**
 * Puts someone on a program from a start date. They get their own copy (so their coach can
 * tweak it without touching anyone else's), and any current program is ended.
 */
export async function assignProgram(
  db: Db,
  actor: Me,
  userId: number,
  programId: number,
  startDate: string,
) {
  const program = await findVisibleProgram(db, actor, programId, false)
  const copyId =
    program.clientId === userId
      ? program.id
      : await copyProgramForClient(db, program.id, userId, actor.id)
  await db.batch([
    db
      .update(enrollments)
      .set({ status: 'cancelled' })
      .where(and(eq(enrollments.userId, userId), eq(enrollments.status, 'active'))),
    db
      .insert(enrollments)
      .values({ userId, programId: copyId, startDate, status: 'active', assignedBy: actor.id }),
  ])
  const [row] = await enrollmentQuery(db)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, 'active')))
    .limit(1)
  return row
}

export const enrollmentRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get('/', async (c) => {
    const { user, db } = c.var
    const programId = c.req.query('programId')
    const filters = [
      managedUsers(user),
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
  /** Assign a program. Coaches assign their own clients, owners anyone. Clients never assign. */
  .post('/', async (c) => {
    const { user, db } = c.var
    const input = await parseBody(c.req.raw, assignInput)
    await managedPerson(db, user, input.userId)
    const row = await assignProgram(db, user, input.userId, input.programId, input.startDate)
    return c.json({ enrollment: row }, 201)
  })
  .delete('/:id', async (c) => {
    const { user, db } = c.var
    const id = parseId(c.req.param('id'))
    const [row] = await db.select().from(enrollments).where(eq(enrollments.id, id))
    if (!row) notFound('Enrollment not found')
    await managedPerson(db, user, row.userId)
    await db.update(enrollments).set({ status: 'cancelled' }).where(eq(enrollments.id, id))
    return c.body(null, 204)
  })
