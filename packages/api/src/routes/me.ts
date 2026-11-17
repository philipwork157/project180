import {
  appActivity,
  bodyCheckins,
  businesses,
  type Db,
  enrollments,
  programs,
  pushSubscriptions,
  sessions,
  users,
  workoutExercises,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  buildProgramCalendar,
  type ChatUnread,
  choosePasswordInput,
  clientProfileInput,
  deleteMyAccountInput,
  feedbackReadInput,
  heartbeatInput,
  isClient,
  isoDate,
  type Me,
  type MyPlan,
  messageInput,
  messageReadInput,
  nutritionTargetsInput,
  type PushSetup,
  pushSubscriptionInput,
  pushUnsubscribeInput,
  startStarterProgramInput,
  todayIn,
  updateProfileInput,
} from '@project180/shared'
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { audit } from '../audit'
import { inChunks } from '../batch'
import { chatNewsForClient, loadThread, markRead, postMessage } from '../chat'
import { deletePersonForGood } from '../delete-person'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId } from '../errors'
import { exportMyData } from '../export'
import { markFeedbackRead, unreadFeedback } from '../feedback'
import { requireUser } from '../middleware'
import { loadProfile, saveProfile } from '../profiles'
import { isPushEndpoint, pushConfigured } from '../push'
import { canQuickWorkout } from '../quick'
import { startDuePrograms } from '../schedule'
import { closeIdleWorkout } from '../sessions'
import { findStarterProgram, listStarterPrograms } from '../starter'
import { buildStats } from '../stats'
import { setPassword, toMe } from '../users'
import { assignProgram, enrollmentQuery } from './enrollments'
import { loadTargets, meFoodRoutes, saveTargets } from './food'
import { meInvitationRoutes } from './invitations'
import { loadProgramDays } from './programs'
import { meWaterRoutes } from './water'

const checkinInput = z.object({
  clientUuid: z.uuid(),
  date: isoDate,
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
  // A queued program whose start date has come takes over first (schedule.ts).
  await startDuePrograms(
    db,
    people.map((p) => p.id),
  )

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
  const assigner = alias(users, 'assigner')
  const [dayMaps, done, assignments, queued] = await Promise.all([
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
    // When each was assigned, by whom, and when their coach last changed their copy.
    inChunks(
      active.map((e) => e.id),
      (ids) =>
        db
          .select({
            id: enrollments.id,
            assignedAt: enrollments.createdAt,
            // Saving their copy, or bringing library changes to it, both touch this.
            changedAt: programs.updatedAt,
            coachName: assigner.name,
            startedAt: enrollments.startedAt,
          })
          .from(enrollments)
          .innerJoin(programs, eq(programs.id, enrollments.programId))
          .leftJoin(assigner, eq(assigner.id, enrollments.assignedBy))
          .where(inArray(enrollments.id, ids)),
    ),
    // What's queued after the current program (the earliest per person is "next").
    inChunks(
      active.map((e) => e.userId),
      (ids) =>
        db
          .select({
            enrollmentId: enrollments.id,
            userId: enrollments.userId,
            programName: programs.name,
            startDate: enrollments.startDate,
            durationWeeks: programs.durationWeeks,
            coachName: assigner.name,
          })
          .from(enrollments)
          .innerJoin(programs, eq(programs.id, enrollments.programId))
          .leftJoin(assigner, eq(assigner.id, enrollments.assignedBy))
          .where(and(inArray(enrollments.userId, ids), eq(enrollments.status, 'scheduled')))
          .orderBy(asc(enrollments.startDate)),
    ),
  ])
  const nextOf = new Map<number, NonNullable<MyPlan['next']>>()
  for (const { userId, ...q } of queued) if (!nextOf.has(userId)) nextOf.set(userId, q)
  const assignedOf = new Map(assignments.map((a) => [a.id, a]))
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
    const assignment = assignedOf.get(enrollment.id)
    result.set(person.id, {
      enrollment,
      assigned: {
        at: (assignment?.assignedAt ?? new Date(0)).toISOString(),
        updatedAt: assignment?.changedAt.toISOString() ?? null,
        coachName: assignment?.coachName ?? null,
        startedAt: assignment?.startedAt?.toISOString() ?? null,
      },
      next: nextOf.get(person.id) ?? null,
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

const coachUser = alias(users, 'coach')

/** A client without a coach, using the app on their own: they set their own targets and plan. */
const onTheirOwn = (user: Me) => isClient(user.role) && user.coachId === null

export const meRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => {
    const { db, user } = c.var
    // Read fresh (a cached sign-in can be a few minutes old): the wizard must end at once.
    const coach = alias(users, 'coach')
    const [row] = await db
      .select({
        needsOnboarding: users.needsOnboarding,
        businessName: businesses.name,
        coachName: coach.name,
      })
      .from(users)
      .leftJoin(businesses, eq(businesses.id, users.businessId))
      .leftJoin(coach, eq(coach.id, users.coachId))
      .where(eq(users.id, user.id))
    return c.json({
      user: {
        ...user,
        needsOnboarding: row?.needsOnboarding ?? false,
        businessName: row?.businessName ?? null,
        coachName: row?.coachName ?? null,
      },
    })
  })
  /** Everything you logged, as one JSON file to keep (POPIA's right of access). */
  .get('/export', async (c) => {
    const { db, user } = c.var
    const data = await exportMyData(db, user)
    const date = new Date().toISOString().slice(0, 10)
    c.header('content-disposition', `attachment; filename="project180-my-data-${date}.json"`)
    c.header('cache-control', 'no-store')
    return c.json(data)
  })
  /**
   * Delete your own account and everything you logged, for good (clients only; staff ask an
   * owner). Your password first, so a phone left unlocked can't do it.
   */
  .post('/delete', async (c) => {
    const { db, user, auth } = c.var
    if (!isClient(user.role))
      throw new HTTPException(403, {
        message: 'Coaches and owners can’t delete themselves here. Ask an owner.',
      })
    const { password } = await parseBody(c.req.raw, deleteMyAccountInput)
    const ctx = await auth.$context
    const account = (await ctx.internalAdapter.findAccounts(String(user.id))).find(
      (a) => a.providerId === 'credential',
    )
    const ok =
      account?.password !== undefined &&
      account.password !== null &&
      (await ctx.password.verify({ hash: account.password, password }))
    if (!ok) throw new HTTPException(400, { message: 'That isn’t your password.' })
    // Nothing of theirs is handed to anyone: clients have no library. Their own copies go too.
    await deletePersonForGood(db, user.id, user.coachId ?? user.id)
    await audit(db, {
      action: 'account.deleted',
      actor: { id: 0, name: user.name },
      businessId: user.businessId,
    })
    return c.body(null, 204)
  })
  /** The welcome wizard is done (or skipped): it never shows again. */
  .post('/onboarding/done', async (c) => {
    const { db, user } = c.var
    await db.update(users).set({ needsOnboarding: false }).where(eq(users.id, user.id))
    return c.json({ user: { ...user, needsOnboarding: false } })
  })
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
    const { user } = c.var
    const input = await parseBody(c.req.raw, clientProfileInput)
    // With a coach, their goal weight and activity level are the coach's, set with their daily
    // targets. On their own, they set them themselves.
    await saveProfile(
      c.var.db,
      user.id,
      onTheirOwn(user) ? input : { ...input, goalWeightKg: undefined, activityLevel: undefined },
    )
    return c.json({ profile: await loadProfile(c.var.db, user.id) })
  })
  /** On your own (no coach): set your own daily targets, with the calculator's settings. */
  .put('/nutrition-targets', async (c) => {
    const { db, user } = c.var
    if (!onTheirOwn(user))
      throw new HTTPException(403, { message: 'Your coach sets your daily targets.' })
    const input = await parseBody(c.req.raw, nutritionTargetsInput)
    await saveTargets(db, user, input, user.id)
    return c.json({ targets: await loadTargets(db, user.id) })
  })
  /** On your own: the ready-made programs you can start (none with a coach: they give you one). */
  .get('/starter-programs', async (c) => {
    const { db, user } = c.var
    return c.json({ programs: onTheirOwn(user) ? await listStarterPrograms(db) : [] })
  })
  /** On your own: start a ready-made program (your own copy, like a coach assigning it). */
  .post('/starter-programs/:id/start', async (c) => {
    const { db, user } = c.var
    if (!onTheirOwn(user)) notFound('Program not found')
    const program = await findStarterProgram(db, parseId(c.req.param('id')))
    if (!program) notFound('Program not found')
    const { startDate } = await parseBody(c.req.raw, startStarterProgramInput)
    const enrollment = await assignProgram(
      db,
      user,
      user.id,
      program.id,
      startDate,
      'restart',
      program,
    )
    return c.json({ enrollment }, 201)
  })
  /** Your active program laid out day by day, plus any unfinished workout. */
  .get('/plan', async (c) => {
    const { db, user } = c.var
    // A workout left idle for hours is closed first, so "Resume" never shows a stale one.
    await closeIdleWorkout(db, user.id)
    const [[active], plan, quickWorkouts] = await Promise.all([
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
      canQuickWorkout(db, user),
    ])
    return c.json({ plan, activeSession: active ?? null, quickWorkouts })
  })
  .get('/stats', async (c) => {
    const { db, user } = c.var
    const weeksBack = Math.min(Math.max(Number(c.req.query('weeks') ?? 8) || 8, 1), 52)
    return c.json({ stats: await buildStats(db, user, weeksBack) })
  })
  /** Your chat with your coach (clients only): the newest messages, or the ones before ?before. */
  .get('/chat', async (c) => {
    const { db, user } = c.var
    if (!isClient(user.role)) notFound()
    const n = Number(c.req.query('before'))
    const [thread, [coach]] = await Promise.all([
      loadThread(db, user.id, user.id, Number.isInteger(n) && n > 0 ? n : undefined),
      db
        .select({ name: coachUser.name })
        .from(users)
        .innerJoin(coachUser, eq(coachUser.id, users.coachId))
        .where(eq(users.id, user.id)),
    ])
    return c.json({ thread, coach: coach ?? null })
  })
  /** Messages from your coach you haven't read and the newest of them (badge, bell, banner). */
  .get('/chat/unread', async (c) => {
    const { db, user } = c.var
    const none: ChatUnread = { unread: 0, latest: null }
    return c.json(isClient(user.role) ? await chatNewsForClient(db, user.id) : none)
  })
  .post('/chat', async (c) => {
    if (!isClient(c.var.user.role)) notFound()
    const input = await parseBody(c.req.raw, messageInput)
    return c.json({ message: await postMessage(c, c.var.user.id, input) }, 201)
  })
  .post('/chat/read', async (c) => {
    const { db, user } = c.var
    if (!isClient(user.role)) notFound()
    const { upTo } = await parseBody(c.req.raw, messageReadInput)
    return c.json({ readUpTo: await markRead(db, user.id, user.id, upTo) })
  })
  /** Your coach's likes and comments you haven't seen yet, newest first. */
  .get('/feedback', async (c) =>
    c.json({ feedback: await unreadFeedback(c.var.db, c.var.user.id) }),
  )
  /** You've seen these (opened the workout they're on). */
  .post('/feedback/read', async (c) => {
    const { ids } = await parseBody(c.req.raw, feedbackReadInput)
    return c.json({ read: await markFeedbackRead(c.var.db, c.var.user.id, ids) })
  })
  /** Can this site push, and with which key? (The app hides the switch when it can't.) */
  .get('/push', (c) => {
    const setup: PushSetup = {
      configured: pushConfigured(c.env),
      publicKey: pushConfigured(c.env) ? (c.env.VAPID_PUBLIC_KEY ?? null) : null,
    }
    return c.json(setup)
  })
  /** This phone turned notifications on. A phone belongs to whoever turned them on last. */
  .put('/push', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, pushSubscriptionInput)
    if (!isPushEndpoint(input.endpoint))
      throw new HTTPException(400, { message: 'Not a push service address' })
    // Tied to this sign-in: once it ends (signed out, expired, signed out by a coach), no more pushes.
    const values = {
      userId: user.id,
      sessionId: c.var.sessionId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
    }
    await db
      .insert(pushSubscriptions)
      .values({ endpoint: input.endpoint, ...values })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values })
    return c.body(null, 204)
  })
  /** This phone turned them off (or is signing out). Only ever your own. */
  .delete('/push', async (c) => {
    const { db, user } = c.var
    const { endpoint } = await parseBody(c.req.raw, pushUnsubscribeInput)
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, user.id)))
    return c.body(null, 204)
  })
  /** Log body weight for a day. Logging the same day again replaces it. */
  .put('/checkins', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, checkinInput)
    const [[active], [clash]] = await Promise.all([
      db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(and(eq(enrollments.userId, user.id), eq(enrollments.status, 'active'))),
      db
        .select({ userId: bodyCheckins.userId, date: bodyCheckins.date })
        .from(bodyCheckins)
        .where(eq(bodyCheckins.clientUuid, input.clientUuid)),
    ])
    // The same id already used (by anyone) for another day: a clear 409, never a 500.
    if (clash && (clash.userId !== user.id || clash.date !== input.date))
      throw new HTTPException(409, { message: 'Weigh-in id in use' })
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
  /** Your food log: days, totals, targets and photo estimates (routes/food.ts). */
  .route('/food', meFoodRoutes)
  /** Your water: what you drank today and your daily goal (routes/water.ts). */
  .route('/water', meWaterRoutes)
  .route('/invitations', meInvitationRoutes)
