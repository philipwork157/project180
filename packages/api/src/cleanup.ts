// Daily housekeeping, run by the phone app Worker's cron trigger (wrangler.jsonc "triggers").
import {
  auditEvents,
  createDb,
  type Db,
  emailTokens,
  errorEvents,
  foodPhotoUses,
  invitations,
  pushSubscriptions,
  sessions,
  signInAttempts,
  signInEvents,
  verifications,
} from '@project180/db'
import { and, eq, isNotNull, isNull, lt, notExists, or } from 'drizzle-orm'
import type { Bindings } from './env'
import { startDuePrograms } from './schedule'
import { closeOpenWorkouts, idleSince } from './sessions'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Removes what nobody needs any more and closes forgotten workouts, in one batch:
 * - sign-ins (devices) past their expiry, and expired verification tokens;
 * - wrong-password counters older than a day that aren't locking anyone out now;
 * - workouts left "in progress" with nothing logged for 4 hours: stopped early if any set was
 *   logged (the sets stay), otherwise cancelled. The app also checks this as it opens;
 * - phones' notifications whose sign-in has ended (they're no longer sent anyway);
 * - photo-estimate counters from before yesterday (only today's count is ever read);
 * - email links (confirm email, reset password) that have expired.
 * Then queued programs whose start date has come take over from the current ones.
 */
export async function dailyCleanup(db: Db, now = Date.now()) {
  const at = new Date(now)
  const [expired, , attempts, stopped, cancelled, pushes, photoDays] = await db.batch([
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
    db
      .delete(foodPhotoUses)
      .where(lt(foodPhotoUses.date, new Date(now - 2 * DAY_MS).toISOString().slice(0, 10)))
      .returning({ userId: foodPhotoUses.userId }),
    // Email links (confirm email, reset password) that have run out.
    db.delete(emailTokens).where(lt(emailTokens.expiresAt, at)),
    // Errors after 30 days; answered or long-expired invitations after 90; the record after 2 years.
    db.delete(errorEvents).where(lt(errorEvents.createdAt, new Date(now - 30 * DAY_MS))),
    db.delete(invitations).where(lt(invitations.expiresAt, new Date(now - 90 * DAY_MS))),
    db.delete(auditEvents).where(lt(auditEvents.createdAt, new Date(now - 730 * DAY_MS))),
    // Sign-in tries after 90 days.
    db.delete(signInEvents).where(lt(signInEvents.createdAt, new Date(now - 90 * DAY_MS))),
  ])
  // Queued programs whose start date has come take over (the plan also does this when read).
  const programsStarted = await startDuePrograms(db, 'everyone', at)
  return {
    sessions: expired.length,
    programsStarted,
    attempts: attempts.length,
    workouts: stopped.length + cancelled.length,
    pushes: pushes.length,
    photoDays: photoDays.length,
  }
}

/** The same, given the Worker's bindings (for the scheduled handler). */
export function runDailyCleanup(env: Bindings) {
  return dailyCleanup(createDb(env.DB))
}
