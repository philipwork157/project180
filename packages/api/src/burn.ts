// Calories burned per day, for the food log (added to the day's calorie target): finished
// workouts (worked out from their sets and duration), activities and steps logged by hand.
// A fixed number of queries per request, however many days are asked for.
import {
  activityLogs,
  bodyCheckins,
  type Db,
  exercises,
  setLogs,
  stepLogs,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  type ActivityLog,
  addDays,
  type BurnSet,
  type DayBurn,
  noBurn,
  stepsKcal,
  todayIn,
  workoutKcal,
} from '@project180/shared'
import { and, asc, desc, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm'

/** Their weight on each day: the latest weigh-in on or before it (null before the first). */
export async function weightOn(db: Db, userId: number, to: string) {
  const rows = await db
    .select({ date: bodyCheckins.date, weightKg: bodyCheckins.weightKg })
    .from(bodyCheckins)
    .where(
      and(
        eq(bodyCheckins.userId, userId),
        lte(bodyCheckins.date, to),
        isNotNull(bodyCheckins.weightKg),
      ),
    )
    .orderBy(desc(bodyCheckins.date))
    .limit(120)
  return (day: string) => rows.find((r) => r.date <= day)?.weightKg ?? rows.at(-1)?.weightKg ?? null
}

/**
 * Everything burned on each day from `from` to `to` (their local days). Workouts are left out
 * when `withWorkouts` is false: a person's training is only for themselves and their own coach.
 */
export async function loadBurn(
  db: Db,
  person: { id: number; timezone: string },
  from: string,
  to: string,
  withWorkouts = true,
): Promise<Map<string, DayBurn>> {
  // Sessions are stored by time: read a day either side, then keep their local days.
  const fromTime = new Date(`${addDays(from, -1)}T00:00:00Z`)
  const toTime = new Date(`${addDays(to, 2)}T00:00:00Z`)
  const [weight, sessions, activities, steps] = await Promise.all([
    weightOn(db, person.id, to),
    withWorkouts
      ? db
          .select({
            id: workoutSessions.id,
            name: workouts.name,
            startedAt: workoutSessions.startedAt,
            durationSeconds: workoutSessions.durationSeconds,
          })
          .from(workoutSessions)
          .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
          .where(
            and(
              eq(workoutSessions.userId, person.id),
              eq(workoutSessions.status, 'completed'),
              gte(workoutSessions.startedAt, fromTime),
              lte(workoutSessions.startedAt, toTime),
            ),
          )
          .orderBy(asc(workoutSessions.startedAt))
      : Promise.resolve([]),
    db
      .select({
        id: activityLogs.id,
        date: activityLogs.date,
        kind: activityLogs.kind,
        minutes: activityLogs.minutes,
        kcal: activityLogs.kcal,
      })
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.userId, person.id),
          gte(activityLogs.date, from),
          lte(activityLogs.date, to),
        ),
      )
      .orderBy(asc(activityLogs.createdAt), asc(activityLogs.id)),
    db
      .select({ date: stepLogs.date, steps: stepLogs.steps })
      .from(stepLogs)
      .where(and(eq(stepLogs.userId, person.id), gte(stepLogs.date, from), lte(stepLogs.date, to))),
  ])
  const inRange = sessions
    .map((s) => ({ ...s, day: todayIn(person.timezone, s.startedAt) }))
    .filter((s) => s.day >= from && s.day <= to)
  const sets =
    inRange.length === 0
      ? []
      : await db
          .select({
            sessionId: setLogs.sessionId,
            category: exercises.category,
            name: exercises.name,
            isWarmup: setLogs.isWarmup,
            durationSeconds: setLogs.durationSeconds,
            distanceM: setLogs.distanceM,
          })
          .from(setLogs)
          .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
          .where(
            inArray(
              setLogs.sessionId,
              inRange.map((s) => s.id),
            ),
          )

  const out = new Map<string, DayBurn>()
  const dayOf = (day: string) => {
    let d = out.get(day)
    if (!d) {
      d = noBurn(weight(day) === null)
      out.set(day, d)
    }
    return d
  }
  const setsBySession = new Map<number, BurnSet[]>()
  for (const s of sets) {
    const list = setsBySession.get(s.sessionId) ?? []
    list.push(s)
    setsBySession.set(s.sessionId, list)
  }
  for (const s of inRange) {
    const kg = weight(s.day)
    const d = dayOf(s.day)
    const kcal = kg === null ? 0 : workoutKcal(setsBySession.get(s.id) ?? [], s.durationSeconds, kg)
    d.workouts.push({
      sessionId: s.id,
      name: s.name ?? 'Workout',
      minutes: s.durationSeconds ? Math.round(s.durationSeconds / 60) : null,
      kcal,
    })
    d.kcal += kcal
  }
  for (const a of activities) {
    const d = dayOf(a.date)
    d.activities.push(a satisfies ActivityLog)
    d.kcal += a.kcal
  }
  for (const s of steps) {
    const kg = weight(s.date)
    const d = dayOf(s.date)
    d.steps = s.steps
    d.stepsKcal = kg === null ? 0 : stepsKcal(s.steps, kg)
    d.kcal += d.stepsKcal
  }
  return out
}
