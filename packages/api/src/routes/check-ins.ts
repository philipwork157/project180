// Check-ins. adminCheckInRoutes is mounted inside adminUserRoutes (/admin/users/:id/check-ins…),
// for the client and their own coach only (coachedPerson: check-ins are coaching). meCheckInRoutes
// is mounted inside meRoutes (/me/check-in): the client's own next check-in and their answers.
import { checkInAnswers, checkIns, type Db, users } from '@project180/db'
import {
  type CheckIn,
  type CheckInAnswers,
  type CheckInList,
  checkInAnswersInput,
  checkInPeriod,
  completeCheckInInput,
  isoDate,
  type MyCheckIn,
  nextCheckInDate,
  scheduleCheckInInput,
  todayIn,
  updateCheckInInput,
} from '@project180/shared'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { Hono } from 'hono'
import { z } from 'zod'
import { coachedPerson } from '../access'
import { buildCheckInReport } from '../check-in-report'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId, parseQuery } from '../errors'

const coach = alias(users, 'check_in_coach')
const PAST = 20

async function loadCheckIns(db: Db, clientId: number, ids?: number[]): Promise<CheckIn[]> {
  const rows = await db
    .select({
      id: checkIns.id,
      dueDate: checkIns.dueDate,
      repeatWeeks: checkIns.repeatWeeks,
      status: checkIns.status,
      coachNotes: checkIns.coachNotes,
      coachName: coach.name,
      doneAt: checkIns.doneAt,
      answers: checkInAnswers,
    })
    .from(checkIns)
    .leftJoin(coach, eq(coach.id, checkIns.coachId))
    .leftJoin(checkInAnswers, eq(checkInAnswers.checkInId, checkIns.id))
    .where(
      and(
        eq(checkIns.clientId, clientId),
        ids ? inArray(checkIns.id, ids) : inArray(checkIns.status, ['scheduled', 'done']),
      ),
    )
    .orderBy(desc(checkIns.dueDate), desc(checkIns.id))
    .limit(PAST + 1)
  return rows.map((r) => ({
    id: r.id,
    dueDate: r.dueDate,
    repeatWeeks: r.repeatWeeks,
    status: r.status,
    coachNotes: r.coachNotes,
    coachName: r.coachName,
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
    answers: r.answers ? toAnswers(r.answers) : null,
  }))
}

function toAnswers(a: typeof checkInAnswers.$inferSelect): CheckInAnswers {
  return {
    week: a.week,
    sleep: a.sleep,
    stress: a.stress,
    hunger: a.hunger,
    wins: a.wins,
    struggles: a.struggles,
    notes: a.notes,
    updatedAt: a.updatedAt.toISOString(),
  }
}

async function listFor(db: Db, clientId: number): Promise<CheckInList> {
  const all = await loadCheckIns(db, clientId)
  return {
    next: all.find((c) => c.status === 'scheduled') ?? null,
    past: all.filter((c) => c.status === 'done').slice(0, PAST),
  }
}

/** The days the report covers: the current period, or the one ending in a past check-in. */
async function periodFor(
  db: Db,
  person: { id: number; timezone: string },
  checkInId: number | null,
) {
  const today = todayIn(person.timezone)
  if (checkInId !== null) {
    const [ci] = await db
      .select({ dueDate: checkIns.dueDate, status: checkIns.status })
      .from(checkIns)
      .where(and(eq(checkIns.id, checkInId), eq(checkIns.clientId, person.id)))
    if (!ci) notFound('Check-in not found')
    const [prev] = await db
      .select({ dueDate: checkIns.dueDate })
      .from(checkIns)
      .where(
        and(
          eq(checkIns.clientId, person.id),
          eq(checkIns.status, 'done'),
          lt(checkIns.dueDate, ci.dueDate),
        ),
      )
      .orderBy(desc(checkIns.dueDate))
      .limit(1)
    return checkInPeriod({ lastDone: prev?.dueDate ?? null, dueDate: ci.dueDate, today })
  }
  const [[last], [next]] = await Promise.all([
    db
      .select({ dueDate: checkIns.dueDate })
      .from(checkIns)
      .where(and(eq(checkIns.clientId, person.id), eq(checkIns.status, 'done')))
      .orderBy(desc(checkIns.dueDate))
      .limit(1),
    db
      .select({ id: checkIns.id, dueDate: checkIns.dueDate })
      .from(checkIns)
      .where(and(eq(checkIns.clientId, person.id), eq(checkIns.status, 'scheduled'))),
  ])
  return {
    ...checkInPeriod({ lastDone: last?.dueDate ?? null, dueDate: next?.dueDate ?? null, today }),
    nextId: next?.id ?? null,
  }
}

const reportQuery = z.object({
  checkInId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
})

export const adminCheckInRoutes = new Hono<AppEnv>()
  .get('/:id/check-ins', async (c) => {
    const person = await coachedPerson(c.var.db, c.var.user, parseId(c.req.param('id')))
    return c.json({ checkIns: await listFor(c.var.db, person.id) })
  })
  /** Set or move the next check-in (one per client), and how often it repeats. */
  .put('/:id/check-ins/next', async (c) => {
    const { db, user } = c.var
    const person = await coachedPerson(db, user, parseId(c.req.param('id')))
    const input = await parseBody(c.req.raw, scheduleCheckInInput)
    const [existing] = await db
      .select({ id: checkIns.id })
      .from(checkIns)
      .where(and(eq(checkIns.clientId, person.id), eq(checkIns.status, 'scheduled')))
    if (existing)
      await db
        .update(checkIns)
        .set({ dueDate: input.dueDate, repeatWeeks: input.repeatWeeks, coachId: user.id })
        .where(eq(checkIns.id, existing.id))
    else
      await db.insert(checkIns).values({
        clientId: person.id,
        coachId: user.id,
        dueDate: input.dueDate,
        repeatWeeks: input.repeatWeeks,
      })
    return c.json({ checkIns: await listFor(db, person.id) })
  })
  /** No next check-in for now. */
  .delete('/:id/check-ins/next', async (c) => {
    const { db, user } = c.var
    const person = await coachedPerson(db, user, parseId(c.req.param('id')))
    await db
      .update(checkIns)
      .set({ status: 'cancelled' })
      .where(and(eq(checkIns.clientId, person.id), eq(checkIns.status, 'scheduled')))
    return c.json({ checkIns: await listFor(db, person.id) })
  })
  /** Notes on a check-in (past or next), or moving the next one. */
  .patch('/:id/check-ins/:checkInId', async (c) => {
    const { db, user } = c.var
    const person = await coachedPerson(db, user, parseId(c.req.param('id')))
    const input = await parseBody(c.req.raw, updateCheckInInput)
    const [row] = await db
      .update(checkIns)
      .set({
        ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
        ...(input.repeatWeeks === undefined ? {} : { repeatWeeks: input.repeatWeeks }),
        ...(input.coachNotes === undefined ? {} : { coachNotes: input.coachNotes }),
      })
      .where(
        and(eq(checkIns.id, parseId(c.req.param('checkInId'))), eq(checkIns.clientId, person.id)),
      )
      .returning({ id: checkIns.id })
    if (!row) notFound('Check-in not found')
    return c.json({ checkIns: await listFor(db, person.id) })
  })
  /** Done: saved with the coach's notes, and the next one scheduled when it repeats. */
  .post('/:id/check-ins/:checkInId/done', async (c) => {
    const { db, user } = c.var
    const person = await coachedPerson(db, user, parseId(c.req.param('id')))
    const { coachNotes } = await parseBody(c.req.raw, completeCheckInInput)
    const [ci] = await db
      .select({ id: checkIns.id, dueDate: checkIns.dueDate, repeatWeeks: checkIns.repeatWeeks })
      .from(checkIns)
      .where(
        and(
          eq(checkIns.id, parseId(c.req.param('checkInId'))),
          eq(checkIns.clientId, person.id),
          eq(checkIns.status, 'scheduled'),
        ),
      )
    if (!ci) notFound('Check-in not found')
    const today = todayIn(person.timezone)
    const next = nextCheckInDate(ci.dueDate, ci.repeatWeeks, today)
    await db.batch([
      db
        .update(checkIns)
        .set({
          status: 'done',
          doneAt: new Date(),
          coachId: user.id,
          ...(coachNotes === undefined ? {} : { coachNotes }),
        })
        .where(eq(checkIns.id, ci.id)),
      ...(next
        ? [
            db.insert(checkIns).values({
              clientId: person.id,
              coachId: user.id,
              dueDate: next,
              repeatWeeks: ci.repeatWeeks,
            }),
          ]
        : []),
    ])
    return c.json({ checkIns: await listFor(db, person.id) })
  })
  /**
   * The report: the current period (since the last check-in, up to the next one or today), the
   * period ending in a past check-in (?checkInId=), or any days (?from=&to=).
   */
  .get('/:id/check-ins/report', async (c) => {
    const { db, user } = c.var
    const person = await coachedPerson(db, user, parseId(c.req.param('id')))
    const q = parseQuery(reportQuery, c.req.query())
    let period: { from: string; to: string; nextId?: number | null }
    if (q.from && q.to && q.from <= q.to) period = { from: q.from, to: q.to }
    else period = await periodFor(db, person, q.checkInId ?? null)
    const report = await buildCheckInReport(
      db,
      person,
      period.from,
      period.to,
      q.checkInId ?? period.nextId ?? null,
    )
    return c.json({ report })
  })

/** The signed-in client's next check-in, with their answers so far. */
async function myNext(db: Db, userId: number): Promise<MyCheckIn | null> {
  const [row] = await db
    .select({
      id: checkIns.id,
      dueDate: checkIns.dueDate,
      coachName: coach.name,
      answers: checkInAnswers,
    })
    .from(checkIns)
    .leftJoin(coach, eq(coach.id, checkIns.coachId))
    .leftJoin(checkInAnswers, eq(checkInAnswers.checkInId, checkIns.id))
    .where(and(eq(checkIns.clientId, userId), eq(checkIns.status, 'scheduled')))
  if (!row) return null
  return {
    id: row.id,
    dueDate: row.dueDate,
    coachName: row.coachName,
    answers: row.answers ? toAnswers(row.answers) : null,
  }
}

export const meCheckInRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json({ checkIn: await myNext(c.var.db, c.var.user.id) }))
  /** Your answers before the check-in (change them any time until it's done). */
  .put('/answers', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, checkInAnswersInput)
    const next = await myNext(db, user.id)
    if (!next) notFound('No check-in coming up')
    const values = { ...input, updatedAt: new Date() }
    await db
      .insert(checkInAnswers)
      .values({ checkInId: next.id, ...values })
      .onConflictDoUpdate({ target: checkInAnswers.checkInId, set: values })
    return c.json({ checkIn: await myNext(db, user.id) })
  })

export { myNext as nextCheckInFor }
