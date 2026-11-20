import {
  appActivity,
  bodyCheckins,
  checkIns,
  clientProfiles,
  enrollments,
  programDays,
  programs,
  pushSubscriptions,
  sessionFeedback,
  sessions,
  setLogs,
  users,
  workoutSessions,
} from '@project180/db'
import {
  addDays,
  assignCoachInput,
  average,
  blockAccessInput,
  clientProfileInput,
  createUserInput,
  type DeletePersonResult,
  type DirectoryPerson,
  deviceLabel,
  type EnrollmentImpact,
  feedbackInput,
  isActiveNow,
  isClient,
  isOwner,
  isoDate,
  isStaff,
  type Me,
  type PastProgram,
  type PeoplePage,
  type PersonActivity,
  type PersonProgress,
  peopleQueryInput,
  type QuickWorkoutsAccess,
  quickWorkoutsAccessInput,
  ROLE_LABELS,
  resetPasswordInput,
  restartProgramInput,
  resumeWeek,
  type SessionSummary,
  startDateForWeek,
  todayIn,
  type UpcomingProgram,
  type UserSummary,
} from '@project180/shared'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  like,
  max,
  ne,
  or,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { type Context, Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { coachedPerson, managedPerson, managedUsers } from '../access'
import { audit } from '../audit'
import { deletePersonForGood } from '../delete-person'
import { newPasswordEmail, sendEmail, welcomeEmail } from '../email'
import type { AppEnv } from '../env'
import { forbidden, notFound, parseBody, parseId } from '../errors'
import { addFeedback, loadFeedback, removeFeedback } from '../feedback'
import { requireAdmin, requireUser } from '../middleware'
import { loadProfile, logWeight, saveProfile } from '../profiles'
import { quickWorkoutsAccess } from '../quick'
import { startDuePrograms } from '../schedule'
import { cancelWorkout, sessionSummaries } from '../sessions'
import { buildPersonStats } from '../stats'
import { createUserWithPassword, setPassword, signedInSql } from '../users'
import { adminCheckInRoutes } from './check-ins'
import { assignProgram } from './enrollments'
import { adminFoodRoutes } from './food'
import { buildPlan } from './me'
import { deleteClientProgram, findVisibleProgram } from './programs'
import { sessionDetail } from './sessions'
import { adminWaterRoutes } from './water'

const resetProgramInput = z.object({
  startDate: isoDate,
})

/** A workout of someone you coach, from `/:id/workouts/:sessionId`; anything else is 404. */
async function managedSession(c: Context<AppEnv>) {
  const { db, user: me } = c.var
  const person = await coachedPerson(db, me, parseId(c.req.param('id') ?? ''))
  const [row] = await db
    .select()
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.id, parseId(c.req.param('sessionId') ?? '')),
        eq(workoutSessions.userId, person.id),
      ),
    )
    .limit(1)
  if (!row) notFound('Workout not found')
  return row
}

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
async function enrollmentImpact(db: Db, enrollmentId: number): Promise<EnrollmentImpact> {
  return (await enrollmentImpacts(db, [enrollmentId])).get(enrollmentId) ?? noImpact
}

const noImpact: EnrollmentImpact = {
  sessions: 0,
  loggedSets: 0,
  checkins: 0,
  likes: 0,
  comments: 0,
}

/** The same counts for several enrollments in four grouped queries. */
async function enrollmentImpacts(db: Db, enrollmentIds: number[]) {
  const out = new Map<number, EnrollmentImpact>(enrollmentIds.map((id) => [id, { ...noImpact }]))
  if (enrollmentIds.length === 0) return out
  const inEnrollments = inArray(workoutSessions.enrollmentId, enrollmentIds)
  const [sessionCounts, setCounts, checkinCounts, feedbackCounts] = await Promise.all([
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
    // Likes and comments are deleted with their workout (cascade), so they're counted here too.
    db
      .select({ id: workoutSessions.enrollmentId, kind: sessionFeedback.kind, n: count() })
      .from(sessionFeedback)
      .innerJoin(workoutSessions, eq(workoutSessions.id, sessionFeedback.sessionId))
      .where(inEnrollments)
      .groupBy(workoutSessions.enrollmentId, sessionFeedback.kind),
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
  for (const r of feedbackCounts) {
    const row = at(r.id)
    if (row) row[r.kind === 'like' ? 'likes' : 'comments'] = r.n
  }
  return out
}

/** Finished workouts listed per past program (the rest are counted). */
const PAST_WORKOUTS = 100

/** Programs queued to take over on their start date, soonest first. */
async function upcomingPrograms(db: Db, userId: number): Promise<UpcomingProgram[]> {
  return db
    .select({
      enrollmentId: enrollments.id,
      programId: enrollments.programId,
      programName: programs.name,
      durationWeeks: programs.durationWeeks,
      startDate: enrollments.startDate,
    })
    .from(enrollments)
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(and(eq(enrollments.userId, userId), eq(enrollments.status, 'scheduled')))
    .orderBy(asc(enrollments.startDate))
}

/** Their finished, archived or replaced programs, newest first, each with its history. */
async function pastPrograms(db: Db, userId: number): Promise<PastProgram[]> {
  const rows = await db
    .select({
      enrollmentId: enrollments.id,
      programId: enrollments.programId,
      programName: programs.name,
      durationWeeks: programs.durationWeeks,
      startDate: enrollments.startDate,
      status: enrollments.status,
      completedAt: enrollments.completedAt,
      updatedAt: enrollments.updatedAt,
    })
    .from(enrollments)
    .innerJoin(programs, eq(programs.id, enrollments.programId))
    .where(
      and(eq(enrollments.userId, userId), inArray(enrollments.status, ['completed', 'cancelled'])),
    )
    .orderBy(desc(enrollments.startDate), desc(enrollments.id))
  if (rows.length === 0) return []
  const enrollmentIds = rows.map((r) => r.enrollmentId)
  // Every past program's history in one go (newest first), then split per program.
  const finishedIn = and(
    eq(workoutSessions.userId, userId),
    inArray(workoutSessions.enrollmentId, enrollmentIds),
    eq(workoutSessions.status, 'completed'),
  )
  const [summaries, owners, impacts, grid] = await Promise.all([
    sessionSummaries(db, finishedIn, 10_000),
    db
      .select({
        id: workoutSessions.id,
        enrollmentId: workoutSessions.enrollmentId,
        programDayId: workoutSessions.programDayId,
      })
      .from(workoutSessions)
      .where(finishedIn),
    enrollmentImpacts(db, enrollmentIds),
    // Their workout days, to work out where "pick up where they left off" resumes.
    db
      .select({
        id: programDays.id,
        programId: programDays.programId,
        weekNumber: programDays.weekNumber,
        workoutId: programDays.workoutId,
      })
      .from(programDays)
      .where(
        and(
          inArray(
            programDays.programId,
            rows.map((r) => r.programId),
          ),
          isNotNull(programDays.workoutId),
        ),
      ),
  ])
  const doneDays = new Set(owners.flatMap((o) => (o.programDayId == null ? [] : [o.programDayId])))
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
      status: r.status === 'completed' ? 'completed' : 'cancelled',
      endedAt: (r.completedAt ?? r.updatedAt).toISOString(),
      workouts: finished.length,
      volumeKg: Math.round(finished.reduce((a, x) => a + x.volumeKg, 0)),
      lastWorkoutAt: finished[0]?.startedAt ?? null,
      recent: finished.slice(0, PAST_WORKOUTS),
      resumeWeek: resumeWeek(
        grid.filter((d) => d.programId === r.programId),
        doneDays,
      ),
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

/** People per page on the People list. */
const PEOPLE_PAGE = 25

/** The coach must be staff in the same business as whoever picks them. */
async function assertCoach(db: Db, me: Me, coachId: number) {
  const [coach] = await db
    .select({ role: users.role, businessId: users.businessId })
    .from(users)
    .where(eq(users.id, coachId))
  if (!coach || !isStaff(coach.role) || coach.businessId !== me.businessId)
    notFound('Coach not found')
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
        signedIn: signedInSql(),
        blockedAt: users.blockedAt,
      })
      .from(users)
      .leftJoin(coach, eq(coach.id, users.coachId))
      .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
      .where(managedUsers(c.var.user))
      .orderBy(asc(users.createdAt))
    const list: UserSummary[] = rows.map(({ blockedAt, signedIn, ...r }) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
      signedIn: Boolean(signedIn),
      blocked: blockedAt !== null,
    }))
    return c.json({ users: list })
  })
  /**
   * The People page: one tab, searched, sorted and paged on the server, with a one-line
   * summary per person. A fixed number of queries however many people there are; details
   * (profile, devices, program) load only when a person is opened.
   */
  .get('/directory', async (c) => {
    const { db, user: me } = c.var
    const parsed = peopleQueryInput.safeParse(c.req.query())
    if (!parsed.success) throw new HTTPException(400, { message: 'Bad search' })
    const input = parsed.data
    // Coaches only ever see their own clients (and themselves).
    const view = isOwner(me.role) || input.view === 'me' ? input.view : 'mine'
    const isMember = eq(users.role, 'member')
    const tab =
      view === 'me'
        ? eq(users.id, me.id)
        : view === 'team'
          ? ne(users.role, 'member')
          : view === 'clients'
            ? isMember
            : and(isMember, eq(users.coachId, me.id))
    const pattern = `%${input.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
    const search = input.q
      ? or(
          like(users.name, sql`${pattern} escape '\\'`),
          like(users.email, sql`${pattern} escape '\\'`),
        )
      : undefined
    const where = and(managedUsers(me), tab, search)
    const order =
      input.sort === 'name'
        ? [sql`${users.name} collate nocase`]
        : input.sort === 'seen'
          ? [sql`${users.lastSeenAt} is null`, desc(users.lastSeenAt)]
          : [asc(users.createdAt)]
    const coach = alias(users, 'coach')
    const [rows, [total], [counts]] = await Promise.all([
      db
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
          signedIn: signedInSql(),
          blockedAt: users.blockedAt,
        })
        .from(users)
        .leftJoin(coach, eq(coach.id, users.coachId))
        .leftJoin(clientProfiles, eq(clientProfiles.userId, users.id))
        .where(where)
        .orderBy(...order, asc(users.id))
        .limit(PEOPLE_PAGE)
        .offset((input.page - 1) * PEOPLE_PAGE),
      db.select({ n: count() }).from(users).where(where),
      // Each tab's head count, for the tab labels (all you may see, before the search).
      db
        .select({
          mine: sql<number>`coalesce(sum(case when ${users.role} = 'member' and ${users.coachId} = ${me.id} then 1 else 0 end), 0)`,
          clients: sql<number>`coalesce(sum(case when ${users.role} = 'member' then 1 else 0 end), 0)`,
          team: sql<number>`coalesce(sum(case when ${users.role} <> 'member' then 1 else 0 end), 0)`,
        })
        .from(users)
        .where(managedUsers(me)),
    ])
    const ids = rows.map((r) => r.id)
    // Anyone whose queued program starts today switches over before we show their program.
    await startDuePrograms(db, ids)
    // The one-line summary for this page only: program, last workout, clients coached.
    const [programRows, workoutRows, clientRows] = ids.length
      ? await Promise.all([
          db
            .select({ userId: enrollments.userId, name: programs.name })
            .from(enrollments)
            .innerJoin(programs, eq(programs.id, enrollments.programId))
            .where(and(inArray(enrollments.userId, ids), eq(enrollments.status, 'active'))),
          db
            .select({ userId: workoutSessions.userId, at: max(workoutSessions.startedAt) })
            .from(workoutSessions)
            .where(
              and(inArray(workoutSessions.userId, ids), eq(workoutSessions.status, 'completed')),
            )
            .groupBy(workoutSessions.userId),
          db
            .select({ coachId: users.coachId, n: count() })
            .from(users)
            .where(and(inArray(users.coachId, ids), eq(users.role, 'member')))
            .groupBy(users.coachId),
        ])
      : [[], [], []]
    const programOf = new Map(programRows.map((r) => [r.userId, r.name]))
    const workoutOf = new Map(workoutRows.map((r) => [r.userId, r.at]))
    const clientsOf = new Map(clientRows.map((r) => [r.coachId, r.n]))
    const people: DirectoryPerson[] = rows.map(({ blockedAt, signedIn, ...r }) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
      signedIn: Boolean(signedIn),
      blocked: blockedAt !== null,
      programName: programOf.get(r.id) ?? null,
      lastWorkoutAt: workoutOf.get(r.id)?.toISOString() ?? null,
      clientCount: clientsOf.get(r.id) ?? 0,
    }))
    const page: PeoplePage = {
      people,
      total: total?.n ?? 0,
      page: input.page,
      pageSize: PEOPLE_PAGE,
      counts: {
        mine: Number(counts?.mine ?? 0),
        clients: Number(counts?.clients ?? 0),
        team: Number(counts?.team ?? 0),
      },
    }
    return c.json(page)
  })
  /** Staff in their business who can coach (owners only): for picking someone's coach. */
  .get('/coaches', async (c) => {
    const me = c.var.user
    if (!isOwner(me.role)) forbidden('Only an owner can see every coach')
    const rows = await c.var.db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(inArray(users.role, ['owner', 'admin']), managedUsers(me)))
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
    if (isStaff(input.role) && !isOwner(me.role)) forbidden('Only an owner can add coaches')
    // A client is coached by whoever adds them, unless an owner picks another coach.
    const pickedCoach = isClient(input.role) && isOwner(me.role) ? (input.coachId ?? null) : null
    const coachId = isClient(input.role) ? (pickedCoach ?? me.id) : null
    // Programs stay between a client and their own coach: their coach assigns one later.
    if (input.program && coachId !== me.id)
      throw new HTTPException(400, { message: 'Only their coach can give them a program' })
    // Check everything that can be refused before creating anything, so a mistake (a program
    // this coach can't use, an unknown coach, an email in use) never leaves a half-made account.
    await Promise.all([
      pickedCoach ? assertCoach(db, me, pickedCoach) : null,
      input.program ? findVisibleProgram(db, me, input.program.programId, false) : null,
      db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .then(([taken]) => {
          if (taken) throw new HTTPException(409, { message: 'That email already has an account' })
        }),
    ])
    // Everyone they add joins their own business.
    const created = await createUserWithPassword(c.var.auth, {
      ...input,
      coachId,
      businessId: me.businessId,
    })
    // The password we set is temporary: they choose their own on first sign-in.
    await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, created.id))
    const user = { ...created, mustChangePassword: true }
    if (input.profile) await saveProfile(db, user.id, input.profile)
    if (input.currentWeightKg)
      await logWeight(db, user.id, todayIn(user.timezone), input.currentWeightKg)
    const enrollment = input.program
      ? await assignProgram(db, me, user.id, input.program.programId, input.program.startDate)
      : null
    // Their first check-in: only with their own coach (check-ins are coaching).
    if (input.checkIn && isClient(user.role) && coachId === me.id)
      await db.insert(checkIns).values({
        clientId: user.id,
        coachId: me.id,
        dueDate: input.checkIn.dueDate,
        repeatWeeks: input.checkIn.repeatWeeks,
      })
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
    await audit(db, {
      action: 'user.created',
      actor: me,
      target: user,
      businessId: me.businessId,
      detail: ROLE_LABELS[user.role],
    })
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
    const result: DeletePersonResult = await deletePersonForGood(db, person.id, me.id)
    await audit(db, {
      action: 'user.deleted',
      actor: me,
      target: { id: 0, name: person.name },
      businessId: me.businessId,
      detail: ROLE_LABELS[person.role],
    })
    return c.json(result)
  })
  /** Whether this client may build their own quick workouts in the app (staff always can). */
  .get('/:id/quick-workouts', async (c) => {
    const person = await coachedPerson(c.var.db, c.var.user, parseId(c.req.param('id')))
    return c.json({ quickWorkouts: await quickWorkoutsAccess(c.var.db, person) })
  })
  .put('/:id/quick-workouts', async (c) => {
    const { db } = c.var
    const person = await coachedPerson(db, c.var.user, parseId(c.req.param('id')))
    if (!isClient(person.role)) forbidden('Coaches and owners can always build their own')
    const { enabled } = await parseBody(c.req.raw, quickWorkoutsAccessInput)
    await db.update(users).set({ quickWorkouts: enabled }).where(eq(users.id, person.id))
    return c.json({ quickWorkouts: { enabled, always: false } satisfies QuickWorkoutsAccess })
  })
  /** Hand a client to another coach (owners only). */
  .patch('/:id/coach', async (c) => {
    const { db, user: me } = c.var
    if (!isOwner(me.role)) forbidden('Only an owner can change who coaches whom')
    const person = await managedPerson(db, me, parseId(c.req.param('id')))
    if (!isClient(person.role)) forbidden('Only clients have a coach')
    const { coachId } = await parseBody(c.req.raw, assignCoachInput)
    await assertCoach(db, me, coachId)
    await db.update(users).set({ coachId }).where(eq(users.id, person.id))
    const [to] = await db.select({ name: users.name }).from(users).where(eq(users.id, coachId))
    await audit(db, {
      action: 'user.coach_changed',
      actor: me,
      target: person,
      businessId: me.businessId,
      detail: to ? `to ${to.name}` : null,
    })
    return c.body(null, 204)
  })
  /**
   * Set a temporary password; optionally email it to them. They're signed out everywhere and
   * choose their own password when they next sign in. (Your own: it's simply your new password,
   * and your other devices are signed out.)
   */
  /**
   * Block someone's access (or let them back in). Blocking signs them out everywhere and stops
   * their notifications; their account and everything they logged stay. Never yourself, never an
   * owner, and only owners block coaches. Coaches block only their own clients (managedPerson).
   */
  .post('/:id/access', async (c) => {
    const { db, user: me } = c.var
    const person = await managedPerson(db, me, parseId(c.req.param('id')))
    const { blocked } = await parseBody(c.req.raw, blockAccessInput)
    if (person.id === me.id) forbidden('You can’t block yourself')
    if (person.role === 'owner') forbidden('An owner can’t be blocked')
    if (isStaff(person.role) && !isOwner(me.role)) forbidden('Only an owner can block a coach')
    if (!blocked) {
      await db.update(users).set({ blockedAt: null }).where(eq(users.id, person.id))
      await audit(db, {
        action: 'user.unblocked',
        actor: me,
        target: person,
        businessId: me.businessId,
      })
      return c.json({ blocked: false })
    }
    await db.batch([
      db.update(users).set({ blockedAt: new Date() }).where(eq(users.id, person.id)),
      db.delete(sessions).where(eq(sessions.userId, person.id)),
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, person.id)),
    ])
    await audit(db, {
      action: 'user.blocked',
      actor: me,
      target: person,
      businessId: me.businessId,
    })
    return c.json({ blocked: true })
  })
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
        // Signed out everywhere, so no phone keeps getting their notifications either.
        db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, person.id)),
      ])
      await audit(db, {
        action: 'user.password_set',
        actor: me,
        target: person,
        businessId: me.businessId,
      })
    } else {
      // Your own: a new password signs you out on your other devices, as in Settings.
      await db
        .delete(sessions)
        .where(and(eq(sessions.userId, me.id), ne(sessions.id, c.var.sessionId)))
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
      .select({
        lastSeenAt: users.lastSeenAt,
        mustChangePassword: users.mustChangePassword,
        blockedAt: users.blockedAt,
      })
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
      activeNow: isActiveNow(lastSeen, live.length > 0),
      blocked: !!row?.blockedAt,
      days: Array.from({ length: 7 }, (_, i) => {
        const date = addDays(from, i)
        return { date, seconds: byDate.get(date) ?? 0 }
      }),
      mustChangePassword: row?.mustChangePassword ?? false,
      devices: live.map((s) => ({
        id: s.id,
        label: deviceLabel(s.userAgent),
        app: s.app === 'app' || s.app === 'admin' ? s.app : null,
        signedInAt: s.createdAt.toISOString(),
        lastActiveAt: s.updatedAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        current: s.id === c.var.sessionId,
      })),
    }
    return c.json({ activity })
  })
  /**
   * One of their workouts in full (planned vs done, set by set), finished or still going.
   * Someone you don't manage, or a session that isn't theirs, answers 404.
   */
  .get('/:id/workouts/:sessionId', async (c) => {
    const { db } = c.var
    const row = await managedSession(c)
    const [session, feedback] = await Promise.all([
      sessionDetail(db, row),
      loadFeedback(db, row.id),
    ])
    return c.json({ session, feedback })
  })
  /** Cancel a workout they started by accident (or left open). It shows as cancelled. */
  .post('/:id/workouts/:sessionId/cancel', async (c) => {
    const row = await managedSession(c)
    await cancelWorkout(c.var.db, row)
    return c.body(null, 204)
  })
  /** Like or comment on their workout, or one exercise in it. They get a push on their phone. */
  .post('/:id/workouts/:sessionId/feedback', async (c) => {
    const row = await managedSession(c)
    const input = await parseBody(c.req.raw, feedbackInput)
    return c.json({ feedback: await addFeedback(c, row, input) }, 201)
  })
  /** Take back your own like or comment. */
  .delete('/:id/workouts/:sessionId/feedback/:feedbackId', async (c) => {
    const row = await managedSession(c)
    await removeFeedback(c.var.db, c.var.user, row.id, parseId(c.req.param('feedbackId')))
    return c.body(null, 204)
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
    // Someone else signed out everywhere (lost phone): their phones stop getting notifications.
    if (person.id !== me.id)
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, person.id))
    return c.json({ signedOut: removed.length })
  })
  /** Their current program and how it's going, plus past (archived) programs with their history. */
  /** Progress over the last weeks: volume, strength per exercise, body weight, records, swaps. */
  .get('/:id/stats', async (c) => {
    const { db } = c.var
    const person = await coachedPerson(db, c.var.user, parseId(c.req.param('id')))
    const weeksBack = Math.min(Math.max(Number(c.req.query('weeks') ?? 12) || 12, 1), 52)
    return c.json({ stats: await buildPersonStats(db, person, weeksBack) })
  })
  .get('/:id/progress', async (c) => {
    const { db } = c.var
    const person = await coachedPerson(db, c.var.user, parseId(c.req.param('id')))
    // The plan first: it starts a queued program whose day has come.
    const plan = await buildPlan(db, person)
    const [upcoming, past] = await Promise.all([
      upcomingPrograms(db, person.id),
      pastPrograms(db, person.id),
    ])
    if (!plan) return c.json({ progress: null, upcoming, past })
    const inEnrollment = and(
      eq(workoutSessions.userId, person.id),
      eq(workoutSessions.enrollmentId, plan.enrollment.id),
    )
    const [finished, latest] = await Promise.all([
      sessionSummaries(db, and(inEnrollment, eq(workoutSessions.status, 'completed')), 500),
      // The coach's list also shows workouts stopped early or cancelled (labelled as such).
      sessionSummaries(db, and(inEnrollment, ne(workoutSessions.status, 'in_progress')), 5),
    ])
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
      recent: latest,
      impact: await enrollmentImpact(db, plan.enrollment.id),
    }
    return c.json({ progress, upcoming, past })
  })
  /** Wipe everything logged on their current program and start it again from a date. */
  .post('/:id/reset-program', async (c) => {
    const { db } = c.var
    const person = await coachedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { startDate } = await parseBody(c.req.raw, resetProgramInput)
    const enrollment = await activeEnrollment(db, person.id)
    await db.batch([
      ...wipeEnrollment(db, enrollment.id),
      db.update(enrollments).set({ startDate }).where(eq(enrollments.id, enrollment.id)),
    ])
    return c.body(null, 204)
  })
  /**
   * Move their current program's start date. Unlike a reset, nothing they logged is deleted:
   * the calendar just shifts (a program you assigned last week can start today).
   */
  .post('/:id/program/start-date', async (c) => {
    const { db } = c.var
    const person = await coachedPerson(db, c.var.user, parseId(c.req.param('id')))
    const { startDate } = await parseBody(c.req.raw, resetProgramInput)
    const enrollment = await activeEnrollment(db, person.id)
    await db.update(enrollments).set({ startDate }).where(eq(enrollments.id, enrollment.id))
    return c.body(null, 204)
  })
  /** Take their current program away, with everything they logged on it. */
  .delete('/:id/program', async (c) => {
    const { db } = c.var
    const person = await coachedPerson(db, c.var.user, parseId(c.req.param('id')))
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
    const person = await coachedPerson(db, c.var.user, parseId(c.req.param('id')))
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
    const person = await coachedPerson(db, c.var.user, parseId(c.req.param('id')))
    const row = await ownEnrollment(db, person.id, parseId(c.req.param('enrollmentId')))
    if (row.status === 'active') return c.body(null, 204)
    if (row.status === 'scheduled')
      throw new HTTPException(409, {
        message: 'It’s queued: it starts on its own on its start date.',
      })
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
  /**
   * Restart a past program from a date: pick up where they left off (continue), start again
   * keeping the old workouts in their history (again), or wipe them and start fresh (fresh).
   */
  .post('/:id/enrollments/:enrollmentId/restart', async (c) => {
    const { db } = c.var
    const person = await coachedPerson(db, c.var.user, parseId(c.req.param('id')))
    const row = await ownEnrollment(db, person.id, parseId(c.req.param('enrollmentId')))
    const { startDate, mode } = await parseBody(c.req.raw, restartProgramInput)
    if (row.status !== 'completed' && row.status !== 'cancelled')
      throw new HTTPException(409, { message: 'Only a past program can be restarted.' })
    const [current] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.userId, person.id), eq(enrollments.status, 'active')))
    if (current)
      throw new HTTPException(409, {
        message: 'They already have a current program. Archive it first.',
      })
    const sessionsOn = eq(workoutSessions.enrollmentId, row.id)
    let start = startDate
    if (mode === 'continue') {
      const [days, done] = await Promise.all([
        db
          .select({
            id: programDays.id,
            weekNumber: programDays.weekNumber,
            workoutId: programDays.workoutId,
          })
          .from(programDays)
          .where(and(eq(programDays.programId, row.programId), isNotNull(programDays.workoutId))),
        db
          .select({ programDayId: workoutSessions.programDayId })
          .from(workoutSessions)
          .where(and(sessionsOn, eq(workoutSessions.status, 'completed'))),
      ])
      const week = resumeWeek(
        days,
        new Set(done.flatMap((d) => (d.programDayId == null ? [] : [d.programDayId]))),
      )
      if (week === null)
        throw new HTTPException(409, {
          message: 'Every workout on it is done. Start it again instead.',
        })
      start = startDateForWeek(startDate, week)
    }
    const reopen = db
      .update(enrollments)
      .set({ status: 'active', startDate: start, completedAt: null })
      .where(eq(enrollments.id, row.id))
    if (mode === 'fresh') await db.batch([...wipeEnrollment(db, row.id), reopen])
    else if (mode === 'again')
      // Old workouts stay in their history and totals but no longer tick off the new calendar.
      await db.batch([
        db.update(workoutSessions).set({ programDayId: null }).where(sessionsOn),
        reopen,
      ])
    else await reopen
    return c.json({ startDate: start })
  })
  /** Delete a past program and everything logged on it, or take a queued program off the list. */
  .delete('/:id/enrollments/:enrollmentId', async (c) => {
    const { db } = c.var
    const person = await coachedPerson(db, c.var.user, parseId(c.req.param('id')))
    const row = await ownEnrollment(db, person.id, parseId(c.req.param('enrollmentId')))
    await db.batch([
      ...wipeEnrollment(db, row.id),
      db.delete(enrollments).where(eq(enrollments.id, row.id)),
    ])
    await deleteClientProgram(db, row.programId)
    return c.body(null, 204)
  })
  /** Their food log and the daily targets you set (routes/food.ts). */
  .route('/', adminFoodRoutes)
  /** Their water and daily water goal (routes/water.ts). */
  .route('/', adminWaterRoutes)
  .route('/', adminCheckInRoutes)
