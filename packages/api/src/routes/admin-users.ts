import {
  appActivity,
  bodyCheckins,
  clientProfiles,
  enrollments,
  exerciseAlternatives,
  exercises,
  programs,
  sessions,
  setLogs,
  signInAttempts,
  users,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  ACTIVE_NOW_MS,
  addDays,
  assignCoachInput,
  average,
  clientProfileInput,
  createUserInput,
  type DeletePersonResult,
  deviceLabel,
  isOwner,
  isStaff,
  type PastProgram,
  type PersonActivity,
  type PersonProgress,
  resetPasswordInput,
  type SessionSummary,
  todayIn,
  type UserSummary,
} from '@project180/shared'
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, ne } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { managedPerson, managedUsers } from '../access'
import { newPasswordEmail, sendEmail, welcomeEmail } from '../email'
import type { AppEnv } from '../env'
import { forbidden, notFound, parseBody, parseId } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import { loadProfile, logWeight, saveProfile } from '../profiles'
import { sessionSummaries } from '../sessions'
import { buildPersonStats } from '../stats'
import { createUserWithPassword, setPassword } from '../users'
import { assignProgram } from './enrollments'
import { buildPlan } from './me'
import { deleteClientProgram, findVisibleProgram } from './programs'

const resetProgramInput = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
})

async function activeEnrollment(db: Db, userId: number) {
  const [enrollment] = await db
    .select({ id: enrollments.id, programId: enrollments.programId })
    .from(enrollments)
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, 'active')))
  if (!enrollment) notFound('No active program')
  return enrollment
}

/** Deletes every workout, set and weigh-in logged on one enrollment (not the enrollment itself). */
function wipeEnrollment(db: Db, enrollmentId: number) {
  const sessionIds = db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(eq(workoutSessions.enrollmentId, enrollmentId))
  return [
    db.delete(setLogs).where(inArray(setLogs.sessionId, sessionIds)),
    db.delete(workoutSessions).where(eq(workoutSessions.enrollmentId, enrollmentId)),
    db.delete(bodyCheckins).where(eq(bodyCheckins.enrollmentId, enrollmentId)),
  ] as const
}

type Db = AppEnv['Variables']['db']

/** Counts of what's logged on one enrollment: what a reset, remove or delete wipes. */
async function enrollmentImpact(db: Db, enrollmentId: number) {
  return (await enrollmentImpacts(db, [enrollmentId])).get(enrollmentId) ?? noImpact
}

const noImpact = { sessions: 0, loggedSets: 0, checkins: 0 }

/** The same counts for several enrollments in three grouped queries. */
async function enrollmentImpacts(db: Db, enrollmentIds: number[]) {
  const out = new Map(enrollmentIds.map((id) => [id, { ...noImpact }]))
  if (enrollmentIds.length === 0) return out
  const inEnrollments = inArray(workoutSessions.enrollmentId, enrollmentIds)
  const [sessionCounts, setCounts, checkinCounts] = await Promise.all([
    db
      .select({ id: workoutSessions.enrollmentId, n: count() })
      .from(workoutSessions)
      .where(inEnrollments)
      .groupBy(workoutSessions.enrollmentId),
    db
      .select({ id: workoutSessions.enrollmentId, n: count() })
      .from(setLogs)
      .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
      .where(inEnrollments)
      .groupBy(workoutSessions.enrollmentId),
    db
      .select({ id: bodyCheckins.enrollmentId, n: count() })
      .from(bodyCheckins)
      .where(inArray(bodyCheckins.enrollmentId, enrollmentIds))
      .groupBy(bodyCheckins.enrollmentId),
  ])
  const at = (id: number | null) => (id === null ? undefined : out.get(id))
  for (const r of sessionCounts) {
    const row = at(r.id)
    if (row) row.sessions = r.n
  }
  for (const r of setCounts) {
    const row = at(r.id)
    if (row) row.loggedSets = r.n
  }
  for (const r of checkinCounts) {
    const row = at(r.id)
    if (row) row.checkins = r.n
  }
  return out
}

/** Their archived (or replaced) programs, newest first, each with its history. */
async function pastPrograms(db: Db, userId: number): Promise<PastProgram[]> {
  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      programId: enrollments.programId,
      programName: programs.name,
      durationWeeks: programs.durationWeeks,
      startDate: enrollments.startDate,
      updatedAt: enrollments.updatedAt,
    })
    .from(enrollments)
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(and(eq(enrollments.userId, userId), ne(enrollments.status, 'active')))
    .orderBy(desc(enrollments.updatedAt))
  if (rows.length === 0) return []
  const enrollmentIds = rows.map((r) => r.enrollmentId)
  // Every past program's history in one go (newest first), then split per program.
  const finishedIn = and(
    eq(workoutSessions.userId, userId),
    inArray(workoutSessions.enrollmentId, enrollmentIds),
    eq(workoutSessions.status, 'completed'),
  )
  const [summaries, owners, impacts] = await Promise.all([
    sessionSummaries(db, finishedIn, 10_000),
    db
      .select({ id: workoutSessions.id, enrollmentId: workoutSessions.enrollmentId })
      .from(workoutSessions)
      .where(finishedIn),
    enrollmentImpacts(db, enrollmentIds),
  ])
  const enrollmentOf = new Map(owners.map((o) => [o.id, o.enrollmentId]))
  const finishedBy = new Map<number, SessionSummary[]>()
  for (const s of summaries) {
    const id = enrollmentOf.get(s.id)
    if (id == null) continue
    const list = finishedBy.get(id) ?? []
    list.push(s)
    finishedBy.set(id, list)
  }
  return rows.map((r) => {
    const finished = finishedBy.get(r.enrollmentId) ?? []
    return {
      enrollmentId: r.enrollmentId,
      programId: r.programId,
      programName: r.programName,
      durationWeeks: r.durationWeeks,
      startDate: r.startDate,
      endedAt: r.updatedAt.toISOString(),
      workouts: finished.length,
      volumeKg: Math.round(finished.reduce((a, x) => a + x.volumeKg, 0)),
      lastWorkoutAt: finished[0]?.startedAt ?? null,
      recent: finished.slice(0, 5),
      impact: impacts.get(r.enrollmentId) ?? noImpact,
    }
  })
}

async function ownEnrollment(db: Db, userId: number, enrollmentId: number) {
  const [row] = await db
    .select({ id: enrollments.id, status: enrollments.status, programId: enrollments.programId })
    .from(enrollments)
    .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.userId, userId)))
  if (!row) notFound('Program not found')
  return row
}

async function assertCoach(db: Db, coachId: number) {
  const [coach] = await db.select({ role: users.role }).from(users).where(eq(users.id, coachId))
  if (!coach || !isStaff(coach.role)) notFound('Coach not found')
}

export const adminUserRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  /** Owners see everyone; a coach sees themselves and their own clients. */
  .get('/', async (c) => {
    const coach = alias(users, 'coach')
    const rows = await c.var.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        coachId: users.coachId,
        coachName: coach.name,
        mainGoal: clientProfiles.mainGoal,
        createdAt: users.createdAt,
        lastSeenAt: users.lastSeenAt,
      })
      .from(users)
      .leftJoin(coach, eq(coach.id, users.coachId))
      .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
      .where(managedUsers(c.var.user))
      .orderBy(asc(users.createdAt))
    const list: UserSummary[] = rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    }))
    return c.json({ users: list })
  })
  /** Staff who can coach (owners only): for picking or changing someone's coach. */
  .get('/coaches', async (c) => {
    if (!isOwner(c.var.user.role)) forbidden('Only an owner can see every coach')
    const rows = await c.var.db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(inArray(users.role, ['owner', 'admin']))
      .orderBy(asc(users.name))
    return c.json({ coaches: rows })
  })
  /**
   * The new-client wizard, in one go: the account, their profile and goals, today's weight as
   * the first weigh-in, optionally a program, and optionally a welcome email with how to sign in.
   * Coaches add clients (who become theirs). Owners can also add coaches, and pick anyone's coach.
   */
  .post('/', async (c) => {
    const { db, user: me } = c.var
    const env = c.env
    const input = await parseBody(c.req.raw, createUserInput)
    if (input.role !== 'member' && !isOwner(me.role)) forbidden('Only an owner can add coaches')
    // A client is coached by whoever adds them, unless an owner picks another coach.
    const pickedCoach = input.role === 'member' && isOwner(me.role) ? (input.coachId ?? null) : null
    const coachId = input.role === 'member' ? (pickedCoach ?? me.id) : null
    // Check everything that can be refused before creating anything, so a mistake (a program
    // this coach can't use, an unknown coach, an email in use) never leaves a half-made account.
    await Promise.all([
      pickedCoach ? assertCoach(db, pickedCoach) : null,
      input.program ? findVisibleProgram(db, me, input.program.programId, false) : null,
      db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .then(([taken]) => {
          if (taken) throw new HTTPException(409, { message: 'That email already has an account' })
        }),
    ])
    const created = await createUserWithPassword(c.var.auth, { ...input, coachId })
    // The password we set is temporary: they choose their own on first sign-in.
    await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, created.id))
    const user = { ...created, mustChangePassword: true }
    if (input.profile) await saveProfile(db, user.id, input.profile)
    if (input.currentWeightKg)
      await logWeight(db, user.id, todayIn(user.timezone), input.currentWeightKg)
    const enrollment = input.program
      ? await assignProgram(db, me, user.id, input.program.programId, input.program.startDate)
      : null
    const email = input.sendWelcome
      ? await sendEmail(env, {
          to: user.email,
          ...welcomeEmail({
            name: user.name,
            email: user.email,
            password: input.password,
            appUrl: env.APP_URL ?? env.BETTER_AUTH_URL,
            coachName: me.name,
          }),
        })
      : null
    return c.json({ user, enrollment, email }, 201)
  })
  /** Contact, body basics and goals. */
  .get('/:id/profile', async (c) => {
    const person = await managedPerson(c.var.db, c.var.user, parseId(c.req.param('id')))
    return c.json({ profile: await loadProfile(c.var.db, person.id) })
  })
  .put('/:id/profile', async (c) => {
    const person = await managedPerson(c.var.db, c.var.user, parseId(c.req.param('id')))
    const input = await parseBody(c.req.raw, clientProfileInput)
    await saveProfile(c.var.db, person.id, input)
    return c.json({ profile: await loadProfile(c.var.db, person.id) })
  })
  /**
   * Delete someone and everything they logged, for good (owners only; a client may ask under
   * POPIA). A coach's clients and library (exercises, workouts, programs, swap suggestions) are
   * handed to the owner doing it. One batch: all of it happens or none of it.
   */
  .delete('/:id', async (c) => {
    const { db, user: me } = c.var
    if (!isOwner(me.role)) forbidden('Only an owner can delete people')
    const person = await managedPerson(db, me, parseId(c.req.param('id')))
    if (person.id === me.id) forbidden('You can’t delete yourself')
    if (person.role === 'owner') forbidden('Owners can’t be deleted')
    const id = person.id
    const n = (rows: { n: number }[]) => rows[0]?.n ?? 0
    const [[row], sessionRows, checkinRows, clientRows, exerciseRows, workoutRows, programRows] =
      await Promise.all([
        db.select({ email: users.email }).from(users).where(eq(users.id, id)),
        db.select({ n: count() }).from(workoutSessions).where(eq(workoutSessions.userId, id)),
        db.select({ n: count() }).from(bodyCheckins).where(eq(bodyCheckins.userId, id)),
        db.select({ n: count() }).from(users).where(eq(users.coachId, id)),
        db.select({ n: count() }).from(exercises).where(eq(exercises.createdBy, id)),
        db
          .select({ n: count() })
          .from(workouts)
          .where(and(eq(workouts.createdBy, id), isNull(workouts.clientId))),
        db
          .select({ n: count() })
          .from(programs)
          .where(and(eq(programs.createdBy, id), isNull(programs.clientId))),
      ])
    await db.batch([
      // Hand over what other people still use.
      db.update(users).set({ coachId: me.id }).where(eq(users.coachId, id)),
      db.update(exercises).set({ createdBy: me.id }).where(eq(exercises.createdBy, id)),
      db.update(workouts).set({ createdBy: me.id }).where(eq(workouts.createdBy, id)),
      db.update(programs).set({ createdBy: me.id }).where(eq(programs.createdBy, id)),
      db
        .update(exerciseAlternatives)
        .set({ createdBy: me.id })
        .where(eq(exerciseAlternatives.createdBy, id)),
      db.update(enrollments).set({ assignedBy: null }).where(eq(enrollments.assignedBy, id)),
      // Everything they logged (sets and session snapshots go with their sessions).
      db.delete(workoutSessions).where(eq(workoutSessions.userId, id)),
      db.delete(bodyCheckins).where(eq(bodyCheckins.userId, id)),
      db.delete(appActivity).where(eq(appActivity.userId, id)),
      db.delete(enrollments).where(eq(enrollments.userId, id)),
      // Their own copies of programs and workouts (days, rows and groups go with them).
      db.delete(programs).where(eq(programs.clientId, id)),
      db.delete(workouts).where(eq(workouts.clientId, id)),
      db.delete(signInAttempts).where(eq(signInAttempts.key, `email:${row?.email ?? ''}`)),
      // Last: the person (sign-ins, devices and profile go with them).
      db.delete(users).where(eq(users.id, id)),
    ])
    const result: DeletePersonResult = {
      removed: { workouts: n(sessionRows), checkins: n(checkinRows) },
      handedOver: {
        clients: n(clientRows),
        exercises: n(exerciseRows),
        workouts: n(workoutRows),
        programs: n(programRows),
      },
    }
    return c.json(result)
  })
  /** Hand a client to another coach (owners only). */
  .patch('/:id/coach', async (c) => {
    const { db, user: me } = c.var
    if (!isOwner(me.role)) forbidden('Only an owner can change who coaches whom')
    const person = await managedPerson(db, me, parseId(c.req.param('id')))
    if (person.role !== 'member') forbidden('Only clients have a coach')
    const { coachId } = await parseBody(c.req.raw, assignCoachInput)
    await assertCoach(db, coachId)
    await db.update(users).set({ coachId }).where(eq(users.id, person.id))
    return c.body(null, 204)
  })
  /**
   * Set a temporary password; optionally email it to them. They're signed out everywhere and
   * choose their own password when they next sign in. (Your own: it's simply your new password.)
   */
  .post('/:id/password', async (c) => {
    const { db, user: me } = c.var
    const person = await managedPerson(db, me, parseId(c.req.param('id')))
    if (person.role === 'owner' && person.id !== me.id)
      forbidden('Owners change their own password')
    const { password, sendEmail: notify } = await parseBody(c.req.raw, resetPasswordInput)
    await setPassword(c.var.auth, person.id, password)
    if (person.id !== me.id) {
      await db.batch([
        db.update(users).set({ mustChangePassword: true }).where(eq(users.id, person.id)),
        db.delete(sessions).where(eq(sessions.userId, person.id)),
      ])
    }
    if (!notify) return c.body(null, 204)
    const [row] = await c.var.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, person.id))
    const email = await sendEmail(c.env, {
      to: row?.email ?? '',
      ...newPasswordEmail({
        name: person.name,
        email: row?.email ?? '',
        password,
        appUrl: c.env.APP_URL ?? c.env.BETTER_AUTH_URL,
      }),
    })
    return c.json({ email })
  })
  /** When they were last seen, time in the app over the last 7 days, and where they're signed in. */
  .get('/:id/activity', async (c) => {
    const { db, user: me } = c.var
    const person = await managedPerson(db, me, parseId(c.req.param('id')))
    const [row] = await db
      .select({ lastSeenAt: users.lastSeenAt, mustChangePassword: users.mustChangePassword })
      .from(users)
      .where(eq(users.id, person.id))
    const today = todayIn(person.timezone)
    const from = addDays(today, -6)
    const logged = await db
      .select({ date: appActivity.date, seconds: appActivity.seconds })
      .from(appActivity)
      .where(and(eq(appActivity.userId, person.id), gte(appActivity.date, from)))
    const byDate = new Map(logged.map((r) => [r.date, r.seconds]))
    const live = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, person.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.updatedAt))
    const lastSeen = row?.lastSeenAt ?? null
    const activity: PersonActivity = {
      lastSeenAt: lastSeen?.toISOString() ?? null,
      activeNow: !!lastSeen && Date.now() - lastSeen.getTime() < ACTIVE_NOW_MS,
      days: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(from, i)
        return { date, seconds: byDate.get(date) ?? 0 }
      }),
      mustChangePassword: row?.mustChangePassword ?? false,
      devices: live.map((s) => ({
        id: s.id,
        label: deviceLabel(s.userAgent),
        signedInAt: s.createdAt.toISOString(),
        lastActiveAt: s.updatedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        current: s.id === c.var.sessionId,
      })),
    }
    return c.json({ activity })
  })
  /** Sign them out on one device. */
  .delete('/:id/sessions/:sessionId', async (c) => {
    const { db, user: me } = c.var
    const person = await managedPerson(db, me, parseId(c.req.param('id')))
    const sessionId = parseId(c.req.param('sessionId'))
    await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, person.id)))
    return c.body(null, 204)
  })
  /** Sign them out on every device (yourself: every device but this one). */
  .post('/:id/sign-out-everywhere', async (c) => {
    const { db, user: me } = c.var
    const person = await managedPerson(db, me, parseId(c.req.param('id')))
    const mine = eq(sessions.userId, person.id)
    const where = person.id === me.id ? and(mine, ne(sessions.id, c.var.sessionId)) : mine
    const removed = await db.delete(sessions).where(where).returning({ id: sessions.id })
    return c.json({ signedOut: removed.length })
  })
  /** Their current program and how it's going, plus past (archived) programs with their history. */
  /** Progress over the last weeks: volume, strength per exercise, body weight, records, swaps. */
  .get('/:id/stats', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const weeksBack = Math.min(Math.max(Number(c.req.query('weeks') ?? 12) || 12, 1), 52)
    return c.json({ stats: await buildPersonStats(db, person, weeksBack) })
  })
  .get('/:id/progress', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const [plan, past] = await Promise.all([buildPlan(db, person), pastPrograms(db, person.id)])
    if (!plan) return c.json({ progress: null, past })
    const inEnrollment = and(
      eq(workoutSessions.userId, person.id),
      eq(workoutSessions.enrollmentId, plan.enrollment.id),
    )
    const finished = await sessionSummaries(
      db,
      and(inEnrollment, eq(workoutSessions.status, 'completed')),
      500,
    )
    const workoutDays = plan.days.filter((d) => d.workoutId !== null)
    const todayDay = plan.days.find((d) => d.isToday)
    const progress: PersonProgress = {
      plan,
      workoutDays: workoutDays.length,
      done: workoutDays.filter((d) => d.state === 'done').length,
      missed: workoutDays.filter((d) => d.state === 'missed').length,
      currentWeek:
        todayDay?.weekNumber ??
        (plan.today < plan.enrollment.startDate ? 0 : plan.enrollment.durationWeeks),
      volumeKg: Math.round(finished.reduce((a, s) => a + s.volumeKg, 0)),
      minutes: Math.round(finished.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 60),
      avgFeeling: average(finished.map((s) => s.feeling)),
      lastWorkoutAt: finished[0]?.startedAt ?? null,
      recent: finished.slice(0, 5),
      impact: await enrollmentImpact(db, plan.enrollment.id),
    }
    return c.json({ progress, past })
  })
  /** Wipe everything logged on their current program and start it again from a date. */
  .post('/:id/reset-program', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { startDate } = await parseBody(c.req.raw, resetProgramInput)
    const enrollment = await activeEnrollment(db, person.id)
    await db.batch([
      ...wipeEnrollment(db, enrollment.id),
      db.update(enrollments).set({ startDate }).where(eq(enrollments.id, enrollment.id)),
    ])
    return c.body(null, 204)
  })
  /** Take their current program away, with everything they logged on it. */
  .delete('/:id/program', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const enrollment = await activeEnrollment(db, person.id)
    await db.batch([
      ...wipeEnrollment(db, enrollment.id),
      db.delete(enrollments).where(eq(enrollments.id, enrollment.id)),
    ])
    await deleteClientProgram(db, enrollment.programId)
    return c.body(null, 204)
  })
  /** Take their current program away but keep everything they logged; it shows under past programs. */
  .post('/:id/program/archive', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const enrollment = await activeEnrollment(db, person.id)
    await db
      .update(enrollments)
      .set({ status: 'cancelled' })
      .where(eq(enrollments.id, enrollment.id))
    return c.body(null, 204)
  })
  /** Put a past program back as their current one, history and dates as they were. */
  .post('/:id/enrollments/:enrollmentId/restore', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const row = await ownEnrollment(db, person.id, parseId(c.req.param('enrollmentId')))
    if (row.status === 'active') return c.body(null, 204)
    const [current] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.userId, person.id), eq(enrollments.status, 'active')))
    if (current)
      throw new HTTPException(409, {
        message: 'They already have a current program. Archive it first.',
      })
    await db.update(enrollments).set({ status: 'active' }).where(eq(enrollments.id, row.id))
    return c.body(null, 204)
  })
  /** Delete a past program and everything logged on it. */
  .delete('/:id/enrollments/:enrollmentId', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const row = await ownEnrollment(db, person.id, parseId(c.req.param('enrollmentId')))
    await db.batch([
      ...wipeEnrollment(db, row.id),
      db.delete(enrollments).where(eq(enrollments.id, row.id)),
    ])
    await deleteClientProgram(db, row.programId)
    return c.body(null, 204)
  })
