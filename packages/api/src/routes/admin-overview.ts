import {
  appActivity,
  enrollments,
  exercises,
  programs,
  users,
  workoutSessions,
  workouts,
} from '@project180/db'
import { ACTIVE_NOW_MS, type AdminOverview, addDays, average, todayIn } from '@project180/shared'
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { managedUsers } from '../access'
import type { AppEnv } from '../env'
import { libraryOnly, visibleTo } from '../library'
import { requireAdmin, requireUser } from '../middleware'
import { sessionSummaries } from '../sessions'
import { buildPlan } from './me'

const DAY_MS = 24 * 60 * 60 * 1000

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
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .where(and(eq(users.role, 'member'), managedUsers(me)))
    const ids = clients.map((u) => u.id)
    const byId = new Map(clients.map((u) => [u.id, u]))

    // Workouts finished by these clients in the last 14 days.
    const finished = ids.length
      ? await db
          .select({ userId: workoutSessions.userId, startedAt: workoutSessions.startedAt })
          .from(workoutSessions)
          .where(
            and(
              inArray(workoutSessions.userId, ids),
              eq(workoutSessions.status, 'completed'),
              gte(workoutSessions.startedAt, lastWeekStart),
            ),
          )
      : []
    const thisWeek = ids.length
      ? await sessionSummaries(
          db,
          and(
            inArray(workoutSessions.userId, ids),
            eq(workoutSessions.status, 'completed'),
            gte(workoutSessions.startedAt, weekStart),
          ),
          1000,
        )
      : []
    const appRows = ids.length
      ? await db
          .select({ seconds: appActivity.seconds })
          .from(appActivity)
          .where(and(inArray(appActivity.userId, ids), gte(appActivity.date, weekFrom)))
      : []

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
      const plan = await buildPlan(db, client)
      const seen = client.lastSeenAt?.getTime() ?? null
      if (client.mustChangePassword) {
        attention.push({
          userId: client.id,
          name: client.name,
          reason: 'not_started',
          detail: seen ? 'Hasn’t chosen a password yet' : 'Hasn’t signed in yet',
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

    const recentRows = ids.length
      ? await db
          .select({ id: workoutSessions.id, userId: workoutSessions.userId })
          .from(workoutSessions)
          .where(and(inArray(workoutSessions.userId, ids), eq(workoutSessions.status, 'completed')))
          .orderBy(desc(workoutSessions.startedAt))
          .limit(8)
      : []
    const recentSummaries = recentRows.length
      ? await sessionSummaries(
          db,
          inArray(
            workoutSessions.id,
            recentRows.map((r) => r.id),
          ),
          8,
        )
      : []
    const ownerOf = new Map(recentRows.map((r) => [r.id, r.userId]))

    const [exerciseCount] = await db
      .select({ n: count() })
      .from(exercises)
      .where(visibleTo(exercises, me))
    const [workoutCount] = await db
      .select({ n: count() })
      .from(workouts)
      .where(and(visibleTo(workouts, me), libraryOnly(workouts)))
    const [programCount] = await db
      .select({ n: count() })
      .from(programs)
      .where(and(visibleTo(programs, me), libraryOnly(programs)))
    const [activeEnrollments] = ids.length
      ? await db
          .select({ n: count() })
          .from(enrollments)
          .where(and(inArray(enrollments.userId, ids), eq(enrollments.status, 'active')))
      : [{ n: 0 }]

    const overview: AdminOverview = {
      clients: {
        total: clients.length,
        activeNow: clients.filter(
          (u) => u.lastSeenAt && now - u.lastSeenAt.getTime() < ACTIVE_NOW_MS,
        ).length,
        activeThisWeek: clients.filter(
          (u) => u.lastSeenAt && now - u.lastSeenAt.getTime() < 7 * DAY_MS,
        ).length,
        onProgram: Math.max(onProgram, activeEnrollments?.n ?? 0),
      },
      week: {
        workouts: thisWeek.length,
        workoutsLastWeek: finished.filter((s) => s.startedAt < weekStart).length,
        volumeKg: Math.round(thisWeek.reduce((a, s) => a + s.volumeKg, 0)),
        minutes: Math.round(thisWeek.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 60),
        avgFeeling: average(thisWeek.map((s) => s.feeling)),
        appSeconds: appRows.reduce((a, r) => a + r.seconds, 0),
        plannedDone,
        plannedTotal,
      },
      daily: Array.from({ length: 14 }, (_, i) => {
        const date = addDays(fortnightFrom, i)
        return { date, workouts: perDay.get(date) ?? 0 }
      }),
      attention,
      recent: recentSummaries.map((s) => {
        const userId = ownerOf.get(s.id) ?? 0
        return { ...s, userId, name: byId.get(userId)?.name ?? 'Client' }
      }),
      library: {
        exercises: exerciseCount?.n ?? 0,
        workouts: workoutCount?.n ?? 0,
        programs: programCount?.n ?? 0,
      },
    }
    return c.json({ overview })
  })
