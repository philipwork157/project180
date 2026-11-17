// Every try to sign in (app or admin), right or wrong, for the platform admin's Sign-ins card.
import { type Db, signInEvents, users } from '@project180/db'
import { eq } from 'drizzle-orm'

export type SignInOutcome = (typeof signInEvents.$inferInsert)['outcome']

/** "Chrome on iPhone" from a browser's user agent: enough to recognise a device, no more. */
export function deviceOf(ua: string | undefined | null): string | null {
  if (!ua) return null
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : null
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(ua)
        ? 'Firefox'
        : /CriOS|Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /curl|python|node|axios|Go-http|okhttp/i.test(ua)
              ? 'Script'
              : null
  if (!os && !browser) return 'Unknown'
  return [browser, os].filter(Boolean).join(' on ')
}

/** Saves one try. Never fails the sign-in: a row that can't be written is logged and skipped. */
export async function recordSignIn(
  db: Db,
  input: {
    app: 'app' | 'admin'
    email: string | null
    outcome: SignInOutcome
    ip: string | null
    country: string | null
    userAgent: string | null
  },
) {
  if (!input.email) return
  try {
    const email = input.email.trim().toLowerCase().slice(0, 200)
    const [person] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
    // A wrong password for an email nobody has is worth telling apart (someone guessing).
    const outcome = input.outcome === 'wrong_password' && !person ? 'no_account' : input.outcome
    await db.insert(signInEvents).values({
      app: input.app,
      email,
      userId: person?.id ?? null,
      outcome,
      ip: input.ip,
      country: input.country,
      device: deviceOf(input.userAgent),
    })
  } catch (err) {
    console.error('[sign-ins] could not record', err)
  }
}
