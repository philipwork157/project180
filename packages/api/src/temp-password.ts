import { accounts, type Db, sessions, users } from '@project180/db'
import {
  canUseAdmin,
  isPlatform,
  TEMP_PASSWORD_DAYS,
  tempPasswordExpired,
} from '@project180/shared'
import { and, eq } from 'drizzle-orm'

export const TEMP_PASSWORD_EXPIRED_MESSAGE = `Your temporary password has expired (they last ${TEMP_PASSWORD_DAYS} days). Ask your coach for a new one.`

/**
 * After a right password: if it is a temporary one set more than TEMP_PASSWORD_DAYS ago, signs
 * them out again and answers true. The credential account's `updated_at` is when the password
 * was last set (account rows change only when the password does).
 */
export async function refuseExpiredTempPassword(db: Db, email: string, now = Date.now()) {
  const [row] = await db
    .select({ id: users.id, setAt: accounts.updatedAt })
    .from(users)
    .innerJoin(accounts, and(eq(accounts.userId, users.id), eq(accounts.providerId, 'credential')))
    .where(and(eq(users.email, email.trim().toLowerCase()), eq(users.mustChangePassword, true)))
  if (!row || !tempPasswordExpired(row.setAt, now)) return false
  // Undo the sign-in that just happened. Until they choose a password, any session they have
  // came from this temporary one, so all of them go.
  await db.delete(sessions).where(eq(sessions.userId, row.id))
  return true
}

export const BLOCKED_MESSAGE =
  'Your access to Project 180 is paused. Talk to your coach to get back in.'

/**
 * A blocked person typed the right password: remove the session Better Auth just made and
 * refuse. Checked only after a correct password, so nobody learns who is blocked by guessing.
 */
export async function refuseBlocked(db: Db, email: string, token: string | null) {
  const [row] = await db
    .select({ blockedAt: users.blockedAt })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
  if (!row?.blockedAt) return false
  if (token) await db.delete(sessions).where(eq(sessions.token, token))
  return true
}

export const STAFF_ONLY_MESSAGE =
  'This sign-in is for coaches and owners. Clients sign in on the Project 180 app.'

/**
 * What a wrong password answers (Better Auth's own body), reused when the phone app refuses the
 * platform admin, so the two can't be told apart from outside.
 */
export const WRONG_PASSWORD_ANSWER = {
  code: 'INVALID_EMAIL_OR_PASSWORD',
  message: 'Invalid email or password',
} as const

/**
 * Admin Worker only (STAFF_ONLY): after a right password, if the person isn't staff, removes
 * the session that was just made (by its token, so their phone stays signed in) and answers true.
 */
export async function refuseNonStaff(db: Db, email: string, token: string | null) {
  const [row] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
  if (!row || canUseAdmin(row.role)) return false
  if (token) await db.delete(sessions).where(eq(sessions.token, token))
  return true
}

/**
 * Phone app only: the platform admin's right password gets no session there (their account is
 * for the dashboard). Removes the session that was just made and answers true.
 */
export async function refusePlatformInApp(db: Db, email: string, token: string | null) {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
  if (!row || !isPlatform(row.role)) return false
  if (token) await db.delete(sessions).where(eq(sessions.token, token))
  return true
}
