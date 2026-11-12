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
import { and, asc, desc, eq, inArray, isNotNull, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'

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

export function completedBy(userId: number) {
  return and(eq(workoutSessions.userId, userId), eq(workoutSessions.status, 'completed'))
}
