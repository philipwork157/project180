// Programs one after another: on a queued program's start date it becomes the current one and
// the old one is finished (everything logged on it stays in their history). Run whenever a plan
// is read (the phone's Today screen, the coach's views) and by the daily cron, so the switch
// happens on the day whoever looks first.
import { type Db, enrollments, users } from '@project180/db'
import { dueToStart, type ScheduleRow, todayIn } from '@project180/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { inChunks, runAll } from './batch'

/**
 * Starts every queued program that is due for these people (or for everyone, from the cron).
 * A fixed number of queries; when nobody has anything queued it is one small indexed read.
 * Returns how many programs were started.
 */
export async function startDuePrograms(
  db: Db,
  who: number[] | 'everyone',
  now: Date = new Date(),
): Promise<number> {
  if (who !== 'everyone' && who.length === 0) return 0
  const columns = {
    id: enrollments.id,
    userId: enrollments.userId,
    startDate: enrollments.startDate,
    timezone: users.timezone,
  }
  const queued =
    who === 'everyone'
      ? await db
          .select(columns)
          .from(enrollments)
          .innerJoin(users, eq(users.id, enrollments.userId))
          .where(eq(enrollments.status, 'scheduled'))
      : await inChunks(who, (ids) =>
          db
            .select(columns)
            .from(enrollments)
            .innerJoin(users, eq(users.id, enrollments.userId))
            .where(and(inArray(enrollments.userId, ids), eq(enrollments.status, 'scheduled'))),
        )
  if (queued.length === 0) return 0

  const people = [...new Set(queued.map((q) => q.userId))]
  const current = await inChunks(people, (ids) =>
    db
      .select({ id: enrollments.id, userId: enrollments.userId, startDate: enrollments.startDate })
      .from(enrollments)
      .where(and(inArray(enrollments.userId, ids), eq(enrollments.status, 'active'))),
  )
  const activeOf = new Map(current.map((c) => [c.userId, c]))
  const queueOf = new Map<number, (ScheduleRow & { timezone: string })[]>()
  for (const q of queued) queueOf.set(q.userId, [...(queueOf.get(q.userId) ?? []), q])

  let started = 0
  const statements: BatchItem<'sqlite'>[] = []
  for (const [userId, queue] of queueOf) {
    const today = todayIn(queue[0]?.timezone ?? 'Africa/Johannesburg', now)
    const { activate, finish } = dueToStart(activeOf.get(userId) ?? null, queue, today)
    if (activate === null) continue
    started++
    // Finish first: at most one active program per person (enrollments_one_active_uq).
    // The status checks make a second request doing the same switch a no-op.
    if (finish.length > 0)
      statements.push(
        db
          .update(enrollments)
          .set({ status: 'completed', completedAt: now })
          .where(
            and(
              inArray(enrollments.id, finish),
              inArray(enrollments.status, ['active', 'scheduled']),
            ),
          ),
      )
    statements.push(
      db
        .update(enrollments)
        .set({ status: 'active', startedAt: now })
        .where(and(eq(enrollments.id, activate), eq(enrollments.status, 'scheduled'))),
    )
  }
  if (statements.length === 0) return 0
  try {
    await runAll(db, statements)
  } catch (err) {
    // Another request switched them over at the same moment (the unique index refused the
    // second): the batch rolled back and the plan reads the winner's result.
    console.warn('[schedule] switch-over skipped', err)
    return 0
  }
  return started
}
