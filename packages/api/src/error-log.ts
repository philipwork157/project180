// Errors the site runs into (a crash, an email that didn't send, a scheduled job that failed),
// kept 30 days for the Platform page. When ERROR_ALERT_COUNT happen within ERROR_ALERT_MINUTES,
// the platform admin gets an email, at most once an hour.
import { appSettings, createDb, errorEvents, users } from '@project180/db'
import { ERROR_ALERT_COUNT, ERROR_ALERT_MINUTES } from '@project180/shared'
import { count, eq, gte } from 'drizzle-orm'
import { errorAlertEmail, sendEmail } from './email'
import type { Bindings } from './env'

const ALERT_KEY = 'error_alert_at'
const HOUR = 60 * 60 * 1000

type Source = 'api' | 'email' | 'push' | 'cron'

/**
 * Saves one error and, when there have been many lately, emails the platform admin. Never
 * throws: recording a failure must not cause another.
 */
export async function recordError(env: Bindings, source: Source, where: string, message: string) {
  try {
    const db = createDb(env.DB)
    await db.insert(errorEvents).values({
      source,
      where: where.slice(0, 200),
      message: message.slice(0, 500),
    })
    const since = new Date(Date.now() - ERROR_ALERT_MINUTES * 60 * 1000)
    const [recent] = await db
      .select({ n: count() })
      .from(errorEvents)
      .where(gte(errorEvents.createdAt, since))
    if ((recent?.n ?? 0) < ERROR_ALERT_COUNT) return
    // Only an email about errors, never one about a failed email (that could loop).
    if (source === 'email') return
    const [last] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, ALERT_KEY))
    if (last && Date.now() - Number(last.value) < HOUR) return
    const now = String(Date.now())
    await db
      .insert(appSettings)
      .values({ key: ALERT_KEY, value: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: now } })
    const admins = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.role, 'platform'))
    const site = env.APP_URL || env.BETTER_AUTH_URL || 'Project 180'
    for (const admin of admins) {
      await sendEmail(env, {
        to: admin.email,
        ...errorAlertEmail({
          name: admin.name,
          count: recent?.n ?? 0,
          minutes: ERROR_ALERT_MINUTES,
          site,
          latest: `${where}: ${message}`.slice(0, 300),
        }),
      })
    }
  } catch (err) {
    console.error('[errors] could not record', err)
  }
}
