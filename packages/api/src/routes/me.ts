import {
  appActivity,
  bodyCheckins,
  type Db,
  enrollments,
  sessions,
  users,
  workoutExercises,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  buildProgramCalendar,
  choosePasswordInput,
  clientProfileInput,
  heartbeatInput,
  type MyPlan,
  todayIn,
  updateProfileInput,
} from '@project180/shared'
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { inChunks } from '../batch'
import type { AppEnv } from '../env'
import { parseBody } from '../errors'
import { requireUser } from '../middleware'
import { loadProfile, saveProfile } from '../profiles'
import { buildStats } from '../stats'
import { setPassword, toMe } from '../users'
import { enrollmentQuery } from './enrollments'
import { loadProgramDays } from './programs'

const checkinInput = z.object({
  clientUuid: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightKg: z.number().min(20).max(400),
  notes: z.string().trim().max(500).nullish(),
})

/** Someone's active program laid out day by day, or null when they have none. */
export async function buildPlan(
  db: Db,
  person: { id: number; timezone: string },
): Promise<MyPlan | null> {
  return (await buildPlans(db, [person])).get(person.id) ?? null
}

/**
 * Several people's plans at once (the dashboard overview). A fixed number of queries whatever
 * the head count, so the overview stays inside D1's per-request query limit as clients grow.
 */
export async function buildPlans(
  db: Db,
  people: { id: number; timezone: string }[],
): Promise<Map<number, MyPlan | null>> {
  const result = new Map<number, MyPlan | null>(people.map((p) => [p.id, null]))
  if (people.length === 0) return result

  const enrollmentRows = await inChunks(
    people.map((p) => p.id),
    (ids) =>
      enrollmentQuery(db)
        .where(and(inArray(enrollments.userId, ids), eq(enrollments.status, 'active')))
        .orderBy(desc(enrollments.id)),
  )
  // One active enrollment per person (the newest, should there ever be two).
  const enrollmentOf = new Map<number, (typeof enrollmentRows)[number]>()
  for (const e of enrollmentRows) if (!enrollmentOf.has(e.userId)) enrollmentOf.set(e.userId, e)
  const active = [...enrollmentOf.values()]
  if (active.length === 0) return result

  // Independent reads: run them together (each D1 call is a round trip).
  const [dayMaps, done] = await Promise.all([
    inChunks([...new Set(active.map((e) => e.programId))], async (ids) => [
      await loadProgramDays(db, ids),
    ]),
    inChunks(
      active.map((e) => e.id),
      (ids) =>
        db
          .select({
            id: workoutSessions.id,
            userId: workoutSessions.userId,
            enrollmentId: workoutSessions.enrollmentId,
            programDayId: workoutSessions.programDayId,
          })
          .from(workoutSessions)
          .where(
            and(
              inArray(workoutSessions.enrollmentId, ids),
              eq(workoutSessions.status, 'completed'),
            ),
          )
          .orderBy(asc(workoutSessions.startedAt)),
    ),
  ])
  const daysOf = new Map(dayMaps.flatMap((m) => [...m]))
  const doneOf = new Map<number, typeof done>()
  for (const d of done) {
    if (d.enrollmentId === null) continue
    const list = doneOf.get(d.enrollmentId) ?? []
    list.push(d)
    doneOf.set(d.enrollmentId, list)
  }

  const workoutIds = [
    ...new Set(
      [...daysOf.values()].flat().flatMap((d) => (d.workoutId === null ? [] : [d.workoutId])),
    ),
  ]
  // Names and exercise counts only (counted in SQL, not by loading every exercise).
  const [workoutRows, counts] = await Promise.all([
    inChunks(workoutIds, (ids) =>
      db
        .select({
          id: workouts.id,
          name: workouts.name,
          estimatedMinutes: workouts.estimatedMinutes,
        })
        .from(workouts)
        .where(inArray(workouts.id, ids)),
    ),
    inChunks(workoutIds, (ids) =>
      db
        .select({ workoutId: workoutExercises.workoutId, n: count() })
        .from(workoutExercises)
        .where(inArray(workoutExercises.workoutId, ids))
        .groupBy(workoutExercises.workoutId),
    ),
  ])
  const countOf = new Map(counts.map((r) => [r.workoutId, r.n]))
  const workoutOf = new Map(workoutRows.map((w) => [w.id, w]))

  for (const person of people) {
    const enrollment = enrollmentOf.get(person.id)
    if (!enrollment) continue
    const days = daysOf.get(enrollment.programId) ?? []
    // Only sessions they logged themselves count (the enrollment is theirs, but be strict).
    const finished = (doneOf.get(enrollment.id) ?? []).filter((d) => d.userId === person.id)
    // Latest finished session per program day, so the calendar can open it.
    const sessionByDay = new Map<number, number>()
    for (const d of finished) if (d.programDayId !== null) sessionByDay.set(d.programDayId, d.id)
    const today = todayIn(person.timezone)
    const calendar = buildProgramCalendar({
      startDate: enrollment.startDate,
      durationWeeks: enrollment.durationWeeks,
      days,
      completedProgramDayIds: finished
        .map((d) => d.programDayId)
        .filter((v): v is number => v !== null),
      today,
    })
    const lookup: MyPlan['workouts'] = {}
    for (const d of days) {
      const w = d.workoutId === null ? undefined : workoutOf.get(d.workoutId)
      if (w) lookup[w.id] = { ...w, exerciseCount: countOf.get(w.id) ?? 0 }
    }
    result.set(person.id, {
      enrollment,
      today,
      workouts: lookup,
      days: calendar.map((d) => ({
        ...d,
        workoutName: d.workoutId ? (lookup[d.workoutId]?.name ?? null) : null,
        sessionId:
          d.state === 'done' && d.programDayId !== null
            ? (sessionByDay.get(d.programDayId) ?? null)
            : null,
      })),
    })
  }
  return result
}

export const meRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', (c) => c.json({ user: c.var.user }))
  /**
   * First sign-in after a temporary password from their coach: they choose their own. It must
   * differ from the temporary one, and every other device signed in with it is signed out.
   */
  .post('/first-password', async (c) => {
    const { db, user, auth } = c.var
    if (!user.mustChangePassword)
      throw new HTTPException(409, { message: 'Your password is already your own' })
    const { password } = await parseBody(c.req.raw, choosePasswordInput)
    const ctx = await auth.$context
    const account = (await ctx.internalAdapter.findAccounts(String(user.id))).find(
      (a) => a.providerId === 'credential',
    )
    if (account?.password && (await ctx.password.verify({ hash: account.password, password }))) {
      throw new HTTPException(400, { message: 'Choose a new password, not the temporary one' })
    }
    await setPassword(auth, user.id, password)
    await db.batch([
      db.update(users).set({ mustChangePassword: false }).where(eq(users.id, user.id)),
      db
        .delete(sessions)
        .where(and(eq(sessions.userId, user.id), ne(sessions.id, c.var.sessionId))),
    ])
    return c.json({ user: { ...user, mustChangePassword: false } })
  })
  /** The app sends one a minute while it's open on screen: adds up time spent per day. */
  .post('/heartbeat', async (c) => {
    const { db, user } = c.var
    const { seconds } = await parseBody(c.req.raw, heartbeatInput)
    await db
      .insert(appActivity)
      .values({ userId: user.id, date: todayIn(user.timezone), seconds })
      .onConflictDoUpdate({
        target: [appActivity.userId, appActivity.date],
        set: { seconds: sql`min(${appActivity.seconds} + ${seconds}, 86400)` },
      })
    return c.body(null, 204)
  })
  .patch('/', async (c) => {
    const input = await parseBody(c.req.raw, updateProfileInput)
    if (Object.keys(input).length === 0) return c.json({ user: c.var.user })
    const [row] = await c.var.db
      .update(users)
      .set(input)
      .where(eq(users.id, c.var.user.id))
      .returning()
    return c.json({ user: row ? toMe(row) : c.var.user })
  })
  /** Your goals and body basics (the same profile your coach sees). */
  .get('/profile', async (c) => c.json({ profile: await loadProfile(c.var.db, c.var.user.id) }))
  .put('/profile', async (c) => {
    const input = await parseBody(c.req.raw, clientProfileInput)
    await saveProfile(c.var.db, c.var.user.id, input)
    return c.json({ profile: await loadProfile(c.var.db, c.var.user.id) })
  })
  /** Your active program laid out day by day, plus any unfinished workout. */
  .get('/plan', async (c) => {
    const { db, user } = c.var
    const [[active], plan] = await Promise.all([
      db
        .select({
          id: workoutSessions.id,
          workoutName: workouts.name,
          startedAt: workoutSessions.startedAt,
        })
        .from(workoutSessions)
        .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
        .where(and(eq(workoutSessions.userId, user.id), eq(workoutSessions.status, 'in_progress')))
        .orderBy(desc(workoutSessions.startedAt))
        .limit(1),
      buildPlan(db, user),
    ])
    return c.json({ plan, activeSession: active ?? null })
  })
  .get('/stats', async (c) => {
    const { db, user } = c.var
    const weeksBack = Math.min(Math.max(Number(c.req.query('weeks') ?? 8) || 8, 1), 52)
    return c.json({ stats: await buildStats(db, user, weeksBack) })
  })
  /** Log body weight for a day. Logging the same day again replaces it. */
  .put('/checkins', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, checkinInput)
    const [active] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.userId, user.id), eq(enrollments.status, 'active')))
    await db
      .insert(bodyCheckins)
      .values({
        ...input,
        notes: input.notes ?? null,
        userId: user.id,
        enrollmentId: active?.id ?? null,
      })
      .onConflictDoUpdate({
        target: [bodyCheckins.userId, bodyCheckins.date],
        set: { weightKg: input.weightKg, notes: input.notes ?? null },
      })
    return c.json({ ok: true })
  })
