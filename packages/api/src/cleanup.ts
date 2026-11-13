// Daily housekeeping, run by the phone app Worker's cron trigger (wrangler.jsonc "triggers").
import {
  createDb,
  type Db,
  sessions,
  signInAttempts,
  verifications,
  workoutSessions,
} from '@project180/db'
import { and, eq, isNull, lt, or } from 'drizzle-orm'
import type { Bindings } from './env'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Removes what nobody needs any more and closes forgotten workouts, in one batch:
 * - sign-ins (devices) past their expiry, and expired verification tokens;
 * - wrong-password counters older than a day that aren't locking anyone out now;
 * - workouts left "in progress" for more than a day: marked abandoned, so they stop showing
 *   as "training now" and don't block the next start. Their logged sets stay.
 */
export async function dailyCleanup(db: Db, now = Date.now()) {
  const at = new Date(now)
  const [expired, , attempts, stale] = await db.batch([
    db.delete(sessions).where(lt(sessions.expiresAt, at)).returning({ id: sessions.id }),
    db.delete(verifications).where(lt(verifications.expiresAt, at)),
    db
      .delete(signInAttempts)
      .where(
        and(
          lt(signInAttempts.firstAt, new Date(now - DAY_MS)),
          or(isNull(signInAttempts.lockedUntil), lt(signInAttempts.lockedUntil, at)),
        ),
      )
      .returning({ key: signInAttempts.key }),
    db
      .update(workoutSessions)
      .set({ status: 'abandoned', endedAt: at })
      .where(
        and(
          eq(workoutSessions.status, 'in_progress'),
          lt(workoutSessions.startedAt, new Date(now - DAY_MS)),
        ),
      )
      .returning({ id: workoutSessions.id }),
  ])
  return { sessions: expired.length, attempts: attempts.length, workouts: stale.length }
}

/** The same, given the Worker's bindings (for the scheduled handler). */
export function runDailyCleanup(env: Bindings) {
  return dailyCleanup(createDb(env.DB))
}
