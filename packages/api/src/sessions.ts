// Queries shared by the sessions and stats routes.
import { type Db, setLogs, workoutSessions, workouts } from '@project180/db'
import type { SessionSummary } from '@project180/shared'
import { and, desc, eq, type SQL, sql } from 'drizzle-orm'

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
  return rows.map((r) => ({
    ...r,
    startedAt: r.startedAt.toISOString(),
    volumeKg: Math.round(Number(r.volumeKg) * 10) / 10,
    setCount: Number(r.setCount),
  }))
}

export function completedBy(userId: number) {
  return and(eq(workoutSessions.userId, userId), eq(workoutSessions.status, 'completed'))
}
