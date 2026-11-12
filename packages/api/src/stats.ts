// Progress numbers for one person: the phone's Progress tab and the coach's Progress page.
import {
  bodyCheckins,
  type Db,
  exercises,
  sessionExercises,
  setLogs,
  workoutSessions,
} from '@project180/db'
import {
  addDays,
  average,
  type MyStats,
  type PersonStats,
  todayIn,
  weekdayIndex,
} from '@project180/shared'
import { and, asc, count, desc, eq, gt, gte, isNotNull, max, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { buildPlan } from './routes/me'
import { completedBy, sessionSummaries } from './sessions'

interface Person {
  id: number
  timezone: string
}

/** Epley, the same as estimatedOneRepMax in shared (1 rep counts as itself). */
const oneRepMaxExpr = sql<
  number | null
>`max(case when ${setLogs.reps} = 1 then ${setLogs.weightKg} when ${setLogs.reps} > 1 then ${setLogs.weightKg} * (1 + ${setLogs.reps} / 30.0) end)`

const round1 = (n: number) => Math.round(n * 10) / 10

/** The first day of the window (a Monday) and the moment to query from. */
export function statsWindow(person: Person, weeksBack: number) {
  const today = todayIn(person.timezone)
  const thisWeek = addDays(today, -weekdayIndex(today))
  const firstWeek = addDays(thisWeek, -7 * (weeksBack - 1))
  const since = new Date(`${firstWeek}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - 1) // time-zone margin; filtered by local day after
  return { today, firstWeek, since }
}

/** Weeks of workouts and volume, records, recent workouts and body weight. */
export async function buildStats(db: Db, person: Person, weeksBack: number): Promise<MyStats> {
  const { firstWeek, since } = statsWindow(person, weeksBack)
  // Independent reads, run together. Records are worked out in SQL (one row per exercise)
  // instead of downloading every set ever logged.
  const [windowRows, bestRows, checkins, recent] = await Promise.all([
    sessionSummaries(db, and(completedBy(person.id), gte(workoutSessions.startedAt, since)), 1000),
    db
      .select({
        exerciseId: setLogs.exerciseId,
        exerciseName: exercises.name,
        bestWeightKg: sql<number>`max(${setLogs.weightKg})`,
        bestOneRepMax: oneRepMaxExpr,
      })
      .from(setLogs)
      .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
      .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
      .where(and(completedBy(person.id), eq(setLogs.isWarmup, false), gt(setLogs.weightKg, 0)))
      .groupBy(setLogs.exerciseId)
      .orderBy(desc(sql`max(${setLogs.weightKg})`))
      .limit(12),
    db
      .select({ date: bodyCheckins.date, weightKg: bodyCheckins.weightKg })
      .from(bodyCheckins)
      .where(eq(bodyCheckins.userId, person.id))
      .orderBy(asc(bodyCheckins.date)),
    sessionSummaries(db, completedBy(person.id), 10),
  ])
  const windowSessions = windowRows
    .map((s) => ({ ...s, day: todayIn(person.timezone, new Date(s.startedAt)) }))
    .filter((s) => s.day >= firstWeek)

  const weeks: MyStats['weeks'] = []
  for (let i = 0; i < weeksBack; i++) {
    const weekStart = addDays(firstWeek, i * 7)
    const inWeek = windowSessions.filter((s) => s.day >= weekStart && s.day < addDays(weekStart, 7))
    weeks.push({
      weekStart,
      workouts: inWeek.length,
      volumeKg: Math.round(inWeek.reduce((a, s) => a + s.volumeKg, 0)),
      minutes: Math.round(inWeek.reduce((a, s) => a + (s.durationSeconds ?? 0), 0) / 60),
    })
  }
  const avgMinutes = average(windowSessions.map((s) => (s.durationSeconds ?? 0) / 60))
  return {
    workouts: windowSessions.length,
    volumeKg: Math.round(windowSessions.reduce((a, s) => a + s.volumeKg, 0)),
    avgMinutes: avgMinutes === null ? null : Math.round(avgMinutes),
    avgFeeling: average(windowSessions.map((s) => s.feeling)),
    weeks,
    records: bestRows.map((r) => ({
      exerciseId: r.exerciseId,
      exerciseName: r.exerciseName,
      bestWeightKg: Number(r.bestWeightKg),
      bestOneRepMax: r.bestOneRepMax === null ? null : round1(Number(r.bestOneRepMax)),
    })),
    recent,
    bodyWeight: checkins.filter(
      (r): r is { date: string; weightKg: number } => r.weightKg !== null,
    ),
  }
}

/** How many exercises the strength chart offers (the ones they do most). */
const STRENGTH_EXERCISES = 10

/**
 * The coach's view of one person: everything on the phone's Progress tab, plus program
 * workouts done as planned, strength per exercise over time, and what they swapped.
 */
export async function buildPersonStats(
  db: Db,
  person: Person,
  weeksBack: number,
): Promise<PersonStats> {
  const { firstWeek, since } = statsWindow(person, weeksBack)
  const original = alias(exercises, 'original')
  const inWindow = and(completedBy(person.id), gte(workoutSessions.startedAt, since))
  const [base, plan, lifts, swapRows] = await Promise.all([
    buildStats(db, person, weeksBack),
    buildPlan(db, person),
    // One row per workout per exercise: the heaviest set and the best estimated max.
    db
      .select({
        startedAt: workoutSessions.startedAt,
        exerciseId: setLogs.exerciseId,
        exerciseName: exercises.name,
        bestWeightKg: max(setLogs.weightKg),
        oneRepMax: oneRepMaxExpr,
      })
      .from(setLogs)
      .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
      .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
      .where(and(inWindow, eq(setLogs.isWarmup, false), gt(setLogs.weightKg, 0)))
      .groupBy(setLogs.sessionId, setLogs.exerciseId)
      .orderBy(asc(workoutSessions.startedAt)),
    db
      .select({
        fromName: original.name,
        toName: exercises.name,
        times: count(),
        lastAt: max(workoutSessions.startedAt),
      })
      .from(sessionExercises)
      .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
      .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
      .innerJoin(original, eq(original.id, sessionExercises.originalExerciseId))
      .where(and(inWindow, isNotNull(sessionExercises.originalExerciseId)))
      .groupBy(sessionExercises.originalExerciseId, sessionExercises.exerciseId)
      .orderBy(desc(count()), desc(max(workoutSessions.startedAt)))
      .limit(10),
  ])

  const byExercise = new Map<number, PersonStats['strength'][number]>()
  for (const r of lifts) {
    const date = todayIn(person.timezone, r.startedAt)
    if (date < firstWeek || r.bestWeightKg === null) continue
    const entry = byExercise.get(r.exerciseId) ?? {
      exerciseId: r.exerciseId,
      exerciseName: r.exerciseName,
      points: [],
    }
    entry.points.push({
      date,
      bestWeightKg: Number(r.bestWeightKg),
      oneRepMax: r.oneRepMax === null ? null : round1(Number(r.oneRepMax)),
    })
    byExercise.set(r.exerciseId, entry)
  }
  const strength = [...byExercise.values()]
    .sort(
      (a, b) => b.points.length - a.points.length || a.exerciseName.localeCompare(b.exerciseName),
    )
    .slice(0, STRENGTH_EXERCISES)

  // Program workouts due in the window (current program): done, and due so far.
  const due = (plan?.days ?? []).filter(
    (d) =>
      d.workoutId !== null && d.date >= firstWeek && (d.state === 'done' || d.state === 'missed'),
  )

  return {
    ...base,
    planned: plan ? { done: due.filter((d) => d.state === 'done').length, due: due.length } : null,
    strength,
    swaps: swapRows.map((s) => ({
      fromName: s.fromName,
      toName: s.toName,
      times: Number(s.times),
      lastDate: s.lastAt ? todayIn(person.timezone, s.lastAt) : null,
    })),
  }
}
