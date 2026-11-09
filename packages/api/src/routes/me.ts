import {
  appActivity,
  bodyCheckins,
  type Db,
  enrollments,
  exercises,
  programs,
  sessions,
  setLogs,
  users,
  workoutExercises,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  addDays,
  average,
  buildProgramCalendar,
  choosePasswordInput,
  clientProfileInput,
  heartbeatInput,
  type MyPlan,
  type MyStats,
  todayIn,
  updateProfileInput,
  weekdayIndex,
} from '@project180/shared'
import { and, asc, count, desc, eq, gt, gte, inArray, ne, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { parseBody } from '../errors'
import { requireUser } from '../middleware'
import { loadProfile, saveProfile } from '../profiles'
import { completedBy, sessionSummaries } from '../sessions'
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
  const [enrollment] = await enrollmentQuery(db)
    .where(and(eq(enrollments.userId, person.id), eq(enrollments.status, 'active')))
    .limit(1)
  if (!enrollment) return null

  // Independent reads: run them together (each D1 call is a round trip).
  const [[program], dayMap, done] = await Promise.all([
    db.select().from(programs).where(eq(programs.id, enrollment.programId)),
    loadProgramDays(db, [enrollment.programId]),
    db
      .select({ id: workoutSessions.id, programDayId: workoutSessions.programDayId })
      .from(workoutSessions)
      .where(and(completedBy(person.id), eq(workoutSessions.enrollmentId, enrollment.id)))
      .orderBy(asc(workoutSessions.startedAt)),
  ])
  const days = dayMap.get(enrollment.programId) ?? []
  // Latest finished session per program day, so the calendar can open it.
  const sessionByDay = new Map<number, number>()
  for (const d of done) if (d.programDayId !== null) sessionByDay.set(d.programDayId, d.id)
  const today = todayIn(person.timezone)
  const calendar = buildProgramCalendar({
    startDate: enrollment.startDate,
    durationWeeks: program?.durationWeeks ?? enrollment.durationWeeks,
    days,
    completedProgramDayIds: done.map((d) => d.programDayId).filter((v): v is number => v !== null),
    today,
  })

  const workoutIds = [
    ...new Set(days.map((d) => d.workoutId).filter((v): v is number => v !== null)),
  ]
  // Names and exercise counts only (counted in SQL, not by loading every exercise).
  const [workoutRows, counts] = workoutIds.length
    ? await Promise.all([
        db
          .select({
            id: workouts.id,
            name: workouts.name,
            estimatedMinutes: workouts.estimatedMinutes,
          })
          .from(workouts)
          .where(inArray(workouts.id, workoutIds)),
        db
          .select({ workoutId: workoutExercises.workoutId, n: count() })
          .from(workoutExercises)
          .where(inArray(workoutExercises.workoutId, workoutIds))
          .groupBy(workoutExercises.workoutId),
      ])
    : [[], []]
  const countOf = new Map(counts.map((r) => [r.workoutId, r.n]))
  const lookup: MyPlan['workouts'] = {}
  for (const w of workoutRows) lookup[w.id] = { ...w, exerciseCount: countOf.get(w.id) ?? 0 }

  const plan: MyPlan = {
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
  }
  return plan
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
    const today = todayIn(user.timezone)
    const thisWeek = addDays(today, -weekdayIndex(today))
    const firstWeek = addDays(thisWeek, -7 * (weeksBack - 1))
    const since = new Date(`${firstWeek}T00:00:00Z`)
    since.setUTCDate(since.getUTCDate() - 1) // time-zone margin; filtered by local day below

    // Independent reads, run together. Records are worked out in SQL (one row per exercise)
    // instead of downloading every set ever logged.
    const [windowRows, bestRows, checkins, recent] = await Promise.all([
      sessionSummaries(db, and(completedBy(user.id), gte(workoutSessions.startedAt, since)), 1000),
      db
        .select({
          exerciseId: setLogs.exerciseId,
          exerciseName: exercises.name,
          bestWeightKg: sql<number>`max(${setLogs.weightKg})`,
          // Epley, the same as estimatedOneRepMax in shared (1 rep counts as itself).
          bestOneRepMax: sql<
            number | null
          >`max(case when ${setLogs.reps} = 1 then ${setLogs.weightKg} when ${setLogs.reps} > 1 then ${setLogs.weightKg} * (1 + ${setLogs.reps} / 30.0) end)`,
        })
        .from(setLogs)
        .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
        .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
        .where(and(completedBy(user.id), eq(setLogs.isWarmup, false), gt(setLogs.weightKg, 0)))
        .groupBy(setLogs.exerciseId)
        .orderBy(desc(sql`max(${setLogs.weightKg})`))
        .limit(12),
      db
        .select({ date: bodyCheckins.date, weightKg: bodyCheckins.weightKg })
        .from(bodyCheckins)
        .where(eq(bodyCheckins.userId, user.id))
        .orderBy(asc(bodyCheckins.date)),
      sessionSummaries(db, completedBy(user.id), 10),
    ])
    const windowSessions = windowRows
      .map((s) => ({ ...s, day: todayIn(user.timezone, new Date(s.startedAt)) }))
      .filter((s) => s.day >= firstWeek)

    const weeks: MyStats['weeks'] = []
    for (let i = 0; i < weeksBack; i++) {
      const weekStart = addDays(firstWeek, i * 7)
      const inWeek = windowSessions.filter(
        (s) => s.day >= weekStart && s.day < addDays(weekStart, 7),
      )
      weeks.push({
        weekStart,
        workouts: inWeek.length,
        volumeKg: Math.round(inWeek.reduce((a, s) => a + s.volumeKg, 0)),
        minutes: Math.round(inWeek.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 60),
      })
    }
    const records: MyStats['records'] = bestRows.map((r) => ({
      exerciseId: r.exerciseId,
      exerciseName: r.exerciseName,
      bestWeightKg: Number(r.bestWeightKg),
      bestOneRepMax:
        r.bestOneRepMax === null ? null : Math.round(Number(r.bestOneRepMax) * 10) / 10,
    }))

    const avgMinutes = average(windowSessions.map((s) => (s.durationSeconds ?? 0) / 60))
    const stats: MyStats = {
      workouts: windowSessions.length,
      volumeKg: Math.round(windowSessions.reduce((a, s) => a + s.volumeKg, 0)),
      avgMinutes: avgMinutes === null ? null : Math.round(avgMinutes),
      avgFeeling: average(windowSessions.map((s) => s.feeling)),
      weeks,
      records,
      recent,
      bodyWeight: checkins.filter(
        (r): r is { date: string; weightKg: number } => r.weightKg !== null,
      ),
    }
    return c.json({ stats })
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
