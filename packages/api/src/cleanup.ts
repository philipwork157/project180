// Daily housekeeping, run by the phone app Worker's cron trigger (wrangler.jsonc "triggers").
import {
  createDb,
  type Db,
  pushSubscriptions,
  sessions,
  signInAttempts,
  verifications,
} from '@project180/db'
import { and, eq, isNotNull, isNull, lt, notExists, or } from 'drizzle-orm'
import type { Bindings } from './env'
import { closeOpenWorkouts, idleSince } from './sessions'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Removes what nobody needs any more and closes forgotten workouts, in one batch:
 * - sign-ins (devices) past their expiry, and expired verification tokens;
 * - wrong-password counters older than a day that aren't locking anyone out now;
 * - workouts left "in progress" with nothing logged for 4 hours: stopped early if any set was
 *   logged (the sets stay), otherwise cancelled. The app also checks this as it opens;
 * - phones' notifications whose sign-in has ended (they're no longer sent anyway).
 */
export async function dailyCleanup(db: Db, now = Date.now()) {
  const at = new Date(now)
  const [expired, , attempts, stopped, cancelled, pushes] = await db.batch([
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
    // Workouts idle for hours: stopped early if anything was logged, otherwise cancelled.
    ...closeOpenWorkouts(db, idleSince(now), at),
    // After the expired sign-ins above are gone (a batch runs in order).
    db
      .delete(pushSubscriptions)
      .where(
        and(
          isNotNull(pushSubscriptions.sessionId),
          notExists(
            db
              .select({ id: sessions.id })
              .from(sessions)
              .where(eq(sessions.id, pushSubscriptions.sessionId)),
          ),
        ),
      )
      .returning({ id: pushSubscriptions.id }),
  ])
  return {
    sessions: expired.length,
    attempts: attempts.length,
    workouts: stopped.length + cancelled.length,
    pushes: pushes.length,
  }
}

/** The same, given the Worker's bindings (for the scheduled handler). */
export function runDailyCleanup(env: Bindings) {
  return dailyCleanup(createDb(env.DB))
}
