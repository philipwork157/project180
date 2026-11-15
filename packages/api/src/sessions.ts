// Queries shared by the sessions and stats routes.
import {
  type Db,
  exercises,
  sessionExercises,
  setLogs,
  workoutSessions,
  workouts,
} from '@project180/db'
import type { ExerciseSwap, SessionSummary } from '@project180/shared'
import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  ne,
  notExists,
  type SQL,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { HTTPException } from 'hono/http-exception'

const volumeExpr = sql<number>`coalesce(sum(case when ${setLogs.isWarmup} = 0 then coalesce(${setLogs.weightKg}, 0) * coalesce(${setLogs.reps}, 0) else 0 end), 0)`

/** Completed (or other) sessions with their total volume and set count. */
export async function sessionSummaries(
  db: Db,
  where: SQL | undefined,
  limit = 200,
): Promise<SessionSummary[]> {
  const rows = await db
    .select({
      id: workoutSessions.id,
      status: workoutSessions.status,
      workoutName: workouts.name,
      startedAt: workoutSessions.startedAt,
      durationSeconds: workoutSessions.durationSeconds,
      feeling: workoutSessions.feeling,
      volumeKg: volumeExpr,
      setCount: sql<number>`count(${setLogs.id})`,
    })
    .from(workoutSessions)
    .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
    .leftJoin(setLogs, eq(setLogs.sessionId, workoutSessions.id))
    .where(where)
    .groupBy(workoutSessions.id)
    .orderBy(desc(workoutSessions.startedAt))
    .limit(limit)
  const swaps = await swapsFor(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    volumeKg: Math.round(Number(r.volumeKg) * 10) / 10,
    setCount: Number(r.setCount),
    swaps: swaps.get(r.id) ?? [],
  }))
}

/** Exercises swapped during these sessions ("Back squat → Leg press"), in workout order. */
export async function swapsFor(db: Db, sessionIds: number[]) {
  const bySession = new Map<number, ExerciseSwap[]>()
  if (sessionIds.length === 0) return bySession
  const original = alias(exercises, 'original')
  // D1 allows 100 bound values per statement.
  for (let i = 0; i < sessionIds.length; i += 90) {
    const rows = await db
      .select({ sessionId: sessionExercises.sessionId, from: original.name, to: exercises.name })
      .from(sessionExercises)
      .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
      .innerJoin(original, eq(original.id, sessionExercises.originalExerciseId))
      .where(
        and(
          inArray(sessionExercises.sessionId, sessionIds.slice(i, i + 90)),
          isNotNull(sessionExercises.originalExerciseId),
        ),
      )
      .orderBy(asc(sessionExercises.sessionId), asc(sessionExercises.position))
    for (const { sessionId, ...swap } of rows) {
      const list = bySession.get(sessionId) ?? []
      list.push(swap)
      bySession.set(sessionId, list)
    }
  }
  return bySession
}

/** A workout left open with no set logged for this long is closed by itself. */
export const IDLE_WORKOUT_MS = 4 * 60 * 60 * 1000

/**
 * Batch statements that close the open workouts matching `where`: stopped early when any set
 * was logged (the sets stay), cancelled when nothing was. Run them in one batch, in this order.
 */
export function closeOpenWorkouts(db: Db, where: SQL | undefined, at: Date) {
  const open = and(eq(workoutSessions.status, 'in_progress'), where)
  const anySet = db
    .select({ x: sql`1` })
    .from(setLogs)
    .where(eq(setLogs.sessionId, workoutSessions.id))
  return [
    db
      .update(workoutSessions)
      .set({ status: 'abandoned', endedAt: at })
      .where(and(open, exists(anySet)))
      .returning({ id: workoutSessions.id }),
    db
      .update(workoutSessions)
      .set({ status: 'cancelled', endedAt: at })
      .where(and(open, notExists(anySet)))
      .returning({ id: workoutSessions.id }),
  ] as const
}

/** Open workouts with nothing logged (and not started) in the last IDLE_WORKOUT_MS. */
export function idleSince(now: number) {
  const lastSet = sql`(select max(${setLogs.completedAt}) from ${setLogs} where ${setLogs.sessionId} = ${workoutSessions.id})`
  return sql`coalesce(${lastSet}, ${workoutSessions.startedAt}) < ${now - IDLE_WORKOUT_MS}`
}

/** Closes this person's workout if it has sat idle for IDLE_WORKOUT_MS (checked as the app opens). */
export async function closeIdleWorkout(db: Db, userId: number, now = Date.now()) {
  const [first, second] = closeOpenWorkouts(
    db,
    and(eq(workoutSessions.userId, userId), idleSince(now)),
    new Date(now),
  )
  await db.batch([first, second])
}

/** Cancels a workout still in progress (its sets stay, for the coach to see). 409 otherwise. */
export async function cancelWorkout(db: Db, session: { id: number; startedAt: Date }) {
  const endedAt = new Date()
  const [row] = await db
    .update(workoutSessions)
    .set({
      status: 'cancelled',
      endedAt,
      durationSeconds: Math.max(
        0,
        Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
      ),
    })
    .where(and(eq(workoutSessions.id, session.id), eq(workoutSessions.status, 'in_progress')))
    .returning({ id: workoutSessions.id })
  if (!row) throw new HTTPException(409, { message: 'This workout is already finished' })
}

/** Every workout of theirs that has ended, however it ended (for their coach's lists). */
export function endedBy(userId: number) {
  return and(eq(workoutSessions.userId, userId), ne(workoutSessions.status, 'in_progress'))
}

export function completedBy(userId: number) {
  return and(eq(workoutSessions.userId, userId), eq(workoutSessions.status, 'completed'))
}
