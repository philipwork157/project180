import {
  accounts,
  appActivity,
  enrollments,
  exercises,
  programs,
  users,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  type AdminOverview,
  addDays,
  average,
  isActiveNow,
  tempPasswordExpired,
  todayIn,
} from '@project180/shared'
import { and, count, desc, eq, gte, inArray, sum } from 'drizzle-orm'
import { Hono } from 'hono'
import { myClients } from '../access'
import { inChunks } from '../batch'
import type { AppEnv } from '../env'
import { libraryOnly, visibleTo } from '../library'
import { requireAdmin, requireUser } from '../middleware'
import { sessionSummaries } from '../sessions'
import { signedInSql } from '../users'
import { buildPlans } from './me'

const DAY_MS = 24 * 60 * 60 * 1000
// A workout left open longer than this was forgotten, not one being done right now.
const LIVE_MS = 4 * 60 * 60 * 1000

/**
 * The dashboard home: how the clients you look after are doing this week, who needs a nudge,
 * and the latest workouts. Owners see every client; a coach sees their own.
 */
export const adminOverviewRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get('/', async (c) => {
    const { db, user: me } = c.var
    const now = Date.now()
    const today = todayIn(me.timezone)
    const weekFrom = addDays(today, -6)
    const fortnightFrom = addDays(today, -13)
    const weekStart = new Date(now - 7 * DAY_MS)
    const lastWeekStart = new Date(now - 14 * DAY_MS)

    const clients = await db
      .select({
        id: users.id,
        name: users.name,
        timezone: users.timezone,
        lastSeenAt: users.lastSeenAt,
        signedIn: signedInSql(),
        mustChangePassword: users.mustChangePassword,
        passwordSetAt: accounts.updatedAt,
      })
      .from(users)
      .leftJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.providerId, 'credential')))
      .where(myClients(me))
    const ids = clients.map((u) => u.id)
    const byId = new Map(clients.map((u) => [u.id, u]))
    const mine = <T>(query: (slice: number[]) => Promise<T[]>) => inChunks(ids, query)

    // Independent reads, all at once: a fixed number of queries however many clients there are.
    const [
      finished,
      thisWeek,
      appRows,
      plans,
      recentRows,
      liveRows,
      [exerciseCount],
      [workoutCount],
      [programCount],
      enrollmentCounts,
    ] = await Promise.all([
      // Workouts finished by these clients in the last 14 days.
      mine((slice) =>
        db
          .select({ userId: workoutSessions.userId, startedAt: workoutSessions.startedAt })
          .from(workoutSessions)
          .where(
            and(
              inArray(workoutSessions.userId, slice),
              eq(workoutSessions.status, 'completed'),
              gte(workoutSessions.startedAt, lastWeekStart),
            ),
          ),
      ),
      mine((slice) =>
        sessionSummaries(
          db,
          and(
            inArray(workoutSessions.userId, slice),
            eq(workoutSessions.status, 'completed'),
            gte(workoutSessions.startedAt, weekStart),
          ),
          1000,
        ),
      ),
      mine((slice) =>
        db
          .select({ seconds: sum(appActivity.seconds) })
          .from(appActivity)
          .where(and(inArray(appActivity.userId, slice), gte(appActivity.date, weekFrom))),
      ),
      buildPlans(db, clients),
      mine((slice) =>
        db
          .select({
            id: workoutSessions.id,
            userId: workoutSessions.userId,
            startedAt: workoutSessions.startedAt,
          })
          .from(workoutSessions)
          .where(
            and(inArray(workoutSessions.userId, slice), eq(workoutSessions.status, 'completed')),
          )
          .orderBy(desc(workoutSessions.startedAt))
          .limit(8),
      ),
      // Training right now: started in the last few hours and not finished yet.
      mine((slice) =>
        db
          .select({
            id: workoutSessions.id,
            userId: workoutSessions.userId,
            startedAt: workoutSessions.startedAt,
          })
          .from(workoutSessions)
          .where(
            and(
              inArray(workoutSessions.userId, slice),
              eq(workoutSessions.status, 'in_progress'),
              gte(workoutSessions.startedAt, new Date(now - LIVE_MS)),
            ),
          ),
      ),
      db.select({ n: count() }).from(exercises).where(visibleTo(exercises, me)),
      db
        .select({ n: count() })
        .from(workouts)
        .where(and(visibleTo(workouts, me), libraryOnly(workouts))),
      db
        .select({ n: count() })
        .from(programs)
        .where(and(visibleTo(programs, me), libraryOnly(programs))),
      mine((slice) =>
        db
          .select({ n: count() })
          .from(enrollments)
          .where(and(inArray(enrollments.userId, slice), eq(enrollments.status, 'active'))),
      ),
    ])
    const activeEnrollments = enrollmentCounts.reduce((a, r) => a + r.n, 0)

    // Day by day for the chart (dates in the coach's time zone).
    const perDay = new Map<string, number>()
    for (const s of finished) {
      const d = todayIn(me.timezone, s.startedAt)
      perDay.set(d, (perDay.get(d) ?? 0) + 1)
    }

    // Each client's program: this week's planned vs done, missed workouts, who has none.
    let plannedDone = 0
    let plannedTotal = 0
    const attention: AdminOverview['attention'] = []
    let onProgram = 0
    for (const client of clients) {
      const plan = plans.get(client.id) ?? null
      const seen = client.lastSeenAt?.getTime() ?? null
      if (client.mustChangePassword) {
        attention.push({
          userId: client.id,
          name: client.name,
          reason: 'not_started',
          detail:
            client.passwordSetAt && tempPasswordExpired(client.passwordSetAt, now)
              ? 'Temporary password expired: set a new one'
              : seen
                ? 'Hasn’t chosen a password yet'
                : 'Hasn’t signed in yet',
        })
        continue
      }
      if (!plan) {
        attention.push({
          userId: client.id,
          name: client.name,
          reason: 'no_program',
          detail: 'No program assigned',
        })
        continue
      }
      onProgram++
      const due = plan.days.filter(
        (d) => d.workoutId !== null && d.date >= weekFrom && d.date <= plan.today,
      )
      const done = due.filter((d) => d.state === 'done').length
      const missed = due.filter((d) => d.state === 'missed').length
      plannedDone += done
      plannedTotal += done + missed
      if (missed >= 2) {
        attention.push({
          userId: client.id,
          name: client.name,
          reason: 'missed',
          detail: `Missed ${missed} workouts this week`,
        })
      } else if (seen === null || now - seen > 7 * DAY_MS) {
        attention.push({
          userId: client.id,
          name: client.name,
          reason: 'quiet',
          detail:
            seen === null
              ? 'Hasn’t opened the app'
              : `Not seen for ${Math.floor((now - seen) / DAY_MS)} days`,
        })
      }
    }

    // The 8 newest across every slice, then their summaries.
    const newest = recentRows
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, 8)
    // One summary query for the newest finished and the live ones together.
    const wanted = [...newest, ...liveRows]
    const summaries = wanted.length
      ? await sessionSummaries(
          db,
          inArray(
            workoutSessions.id,
            wanted.map((r) => r.id),
          ),
          wanted.length,
        )
      : []
    const summaryOf = new Map(summaries.map((s) => [s.id, s]))
    const withName = (r: { id: number; userId: number }) => {
      const s = summaryOf.get(r.id)
      return s ? [{ ...s, userId: r.userId, name: byId.get(r.userId)?.name ?? 'Client' }] : []
    }

    const overview: AdminOverview = {
      clients: {
        total: clients.length,
        activeNow: clients.filter((u) => isActiveNow(u.lastSeenAt, Boolean(u.signedIn), now))
          .length,
        activeThisWeek: clients.filter(
          (u) => u.lastSeenAt && now - u.lastSeenAt.getTime() < 7 * DAY_MS,
        ).length,
        onProgram: Math.max(onProgram, activeEnrollments),
      },
      week: {
        workouts: thisWeek.length,
        workoutsLastWeek: finished.filter((s) => s.startedAt < weekStart).length,
        volumeKg: Math.round(thisWeek.reduce((a, s) => a + s.volumeKg, 0)),
        minutes: Math.round(thisWeek.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 60),
        avgFeeling: average(thisWeek.map((s) => s.feeling)),
        appSeconds: appRows.reduce((a, r) => a + Number(r.seconds ?? 0), 0),
        plannedDone,
        plannedTotal,
      },
      daily: Array.from({ length: 14 }, (_, i) => {
        const date = addDays(fortnightFrom, i)
        return { date, workouts: perDay.get(date) ?? 0 }
      }),
      attention,
      recent: newest.flatMap(withName),
      live: liveRows
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .flatMap(withName),
      library: {
        exercises: exerciseCount?.n ?? 0,
        workouts: workoutCount?.n ?? 0,
        programs: programCount?.n ?? 0,
      },
    }
    return c.json({ overview })
  })
