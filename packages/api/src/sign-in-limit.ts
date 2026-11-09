import { type Db, signInAttempts } from '@project180/db'
import { eq, inArray } from 'drizzle-orm'

/** Wrong passwords allowed per email, and per network address, before a pause. */
export const EMAIL_LIMIT = 5
export const IP_LIMIT = 20
/** Failures count within this window, and a lock lasts this long. */
export const WINDOW_MS = 15 * 60 * 1000

export interface SignInKeys {
  email: string | null
  ip: string | null
}

function keysOf(k: SignInKeys) {
  return [
    k.email ? `email:${k.email.trim().toLowerCase()}` : null,
    k.ip ? `ip:${k.ip}` : null,
  ].filter((x): x is string => x !== null)
}

/** Minutes left on a lock for this email or address, or 0 when they may try. */
export async function minutesLocked(db: Db, k: SignInKeys, now = Date.now()): Promise<number> {
  const keys = keysOf(k)
  if (!keys.length) return 0
  const rows = await db.select().from(signInAttempts).where(inArray(signInAttempts.key, keys))
  const until = Math.max(0, ...rows.map((r) => r.lockedUntil?.getTime() ?? 0))
  return until > now ? Math.ceil((until - now) / 60000) : 0
}

/** Counts a wrong password against the email and the address; locks either one at its limit. */
export async function recordFailure(db: Db, k: SignInKeys, now = Date.now()) {
  for (const key of keysOf(k)) {
    const limit = key.startsWith('email:') ? EMAIL_LIMIT : IP_LIMIT
    const [row] = await db.select().from(signInAttempts).where(eq(signInAttempts.key, key))
    const fresh = !row || now - row.firstAt.getTime() > WINDOW_MS
    const failures = fresh ? 1 : row.failures + 1
    const values = {
      failures,
      firstAt: fresh ? new Date(now) : row.firstAt,
      lockedUntil: failures >= limit ? new Date(now + WINDOW_MS) : null,
    }
    await db
      .insert(signInAttempts)
      .values({ key, ...values })
      .onConflictDoUpdate({ target: signInAttempts.key, set: values })
  }
}

/** A right password clears the count for that email (not the address: others share it). */
export async function clearFailures(db: Db, k: SignInKeys) {
  if (k.email)
    await db
      .delete(signInAttempts)
      .where(eq(signInAttempts.key, `email:${k.email.trim().toLowerCase()}`))
}
