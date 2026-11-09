import {
  appActivity,
  bodyCheckins,
  clientProfiles,
  enrollments,
  programs,
  sessions,
  setLogs,
  users,
  workoutSessions,
} from '@project180/db'
import {
  ACTIVE_NOW_MS,
  addDays,
  assignCoachInput,
  average,
  clientProfileInput,
  createUserInput,
  deviceLabel,
  isOwner,
  isStaff,
  type PastProgram,
  type PersonActivity,
  type PersonProgress,
  resetPasswordInput,
  todayIn,
  type UserSummary,
} from '@project180/shared'
import { and, asc, count, desc, eq, gt, gte, inArray, ne } from 'drizzle-orm'
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
import { createUserWithPassword, setPassword } from '../users'
import { assignProgram } from './enrollments'
import { buildPlan } from './me'
import { deleteClientProgram } from './programs'

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
  const inEnrollment = eq(workoutSessions.enrollmentId, enrollmentId)
  const [sessionCount] = await db.select({ n: count() }).from(workoutSessions).where(inEnrollment)
  const [setCount] = await db
    .select({ n: count() })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .where(inEnrollment)
  const [checkinCount] = await db
    .select({ n: count() })
    .from(bodyCheckins)
    .where(eq(bodyCheckins.enrollmentId, enrollmentId))
  return {
    sessions: sessionCount?.n ?? 0,
    loggedSets: setCount?.n ?? 0,
    checkins: checkinCount?.n ?? 0,
  }
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
  const out: PastProgram[] = []
  for (const r of rows) {
    const finished = await sessionSummaries(
      db,
      and(
        eq(workoutSessions.enrollmentId, r.enrollmentId),
        eq(workoutSessions.status, 'completed'),
      ),
      500,
    )
    out.push({
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
      impact: await enrollmentImpact(db, r.enrollmentId),
    })
  }
  return out
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
    let coachId: number | null = input.role === 'member' ? me.id : null
    if (input.role === 'member' && input.coachId && isOwner(me.role)) {
      await assertCoach(db, input.coachId)
      coachId = input.coachId
    }
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
  .get('/:id/progress', async (c) => {
    const { db } = c.var
    const person = await managedPerson(db, c.var.user, parseId(c.req.param('id')))
    const plan = await buildPlan(db, person)
    const past = await pastPrograms(db, person.id)
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
