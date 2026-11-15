import { createDb } from '@project180/db'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { appKindOf, createAuth } from './auth'
import type { AppEnv, Bindings } from './env'
import { mountMedia } from './media'
import { adminChatRoutes } from './routes/admin-chat'
import { adminEmailRoutes } from './routes/admin-email'
import { adminOverviewRoutes } from './routes/admin-overview'
import { adminSettingsRoutes } from './routes/admin-settings'
import { adminUserRoutes } from './routes/admin-users'
import { enrollmentRoutes } from './routes/enrollments'
import { exerciseRoutes } from './routes/exercises'
import { meRoutes } from './routes/me'
import { programBuilderRoutes } from './routes/program-builder'
import { programRoutes } from './routes/programs'
import { sessionRoutes } from './routes/sessions'
import { videoRoutes } from './routes/videos'
import { workoutBuilderRoutes } from './routes/workout-builder'
import { workoutRoutes } from './routes/workouts'
import { clearFailures, minutesLocked, recordFailure } from './sign-in-limit'
import {
  BLOCKED_MESSAGE,
  refuseBlocked,
  refuseExpiredTempPassword,
  refuseNonStaff,
  STAFF_ONLY_MESSAGE,
  TEMP_PASSWORD_EXPIRED_MESSAGE,
} from './temp-password'

export { dailyCleanup, runDailyCleanup } from './cleanup'
export type { Bindings } from './env'

const originOf = (url: string) => {
  try {
    return new URL(url.trim()).origin
  } catch {
    return null
  }
}

const sameOrigin = (origin: string, requestUrl: string) => origin === originOf(requestUrl)

/** Sites allowed to send us forms: our own address and the ones Better Auth trusts. */
function allowedOrigins(env: Bindings) {
  const list = [env.BETTER_AUTH_URL, ...(env.TRUSTED_ORIGINS?.split(',') ?? [])]
  return new Set(list.map((u) => (u ? originOf(u) : null)).filter((o): o is string => o !== null))
}

/** The whole API, mounted at /api. The web app's Worker serves it. */
export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api')

  app.use('*', async (c, next) => {
    c.set('db', createDb(c.env.DB))
    const kind = appKindOf(c.env, c.req.raw.headers)
    c.set('appKind', kind)
    c.set('auth', createAuth(c.env, kind))
    await next()
  })

  // Security headers on every API answer. Photos under /api/media are shown by the other app
  // too (the admin uses the phone app's address), so they may be loaded cross-origin.
  app.use(
    '*',
    secureHeaders({
      crossOriginResourcePolicy: false,
      strictTransportSecurity: 'max-age=31536000',
      contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    }),
  )
  // CSRF: a form or text/plain POST from another site (which skips the CORS preflight) is
  // refused unless it comes from our own origin. JSON from elsewhere is already blocked by CORS.
  app.use(
    '*',
    csrf({
      origin: (origin, c) => allowedOrigins(c.env).has(origin) || sameOrigin(origin, c.req.url),
    }),
  )

  /** Email + password sign-in, with a limit on wrong passwords per email and per address. */
  app.post('/auth/sign-in/email', async (c) => {
    const body = (await c.req.raw
      .clone()
      .json()
      .catch(() => null)) as { email?: unknown } | null
    const keys = {
      email: typeof body?.email === 'string' ? body.email : null,
      // Set by Cloudflare; absent locally, where only the per-email limit applies.
      ip: c.req.header('cf-connecting-ip') ?? null,
    }
    const db = c.var.db
    const wait = await minutesLocked(db, keys)
    if (wait > 0) {
      const message = `Too many tries. Please wait ${wait} minute${wait === 1 ? '' : 's'} and try again.`
      return c.json({ code: 'TOO_MANY_ATTEMPTS', message, error: message }, 429)
    }
    const res = await c.var.auth.handler(c.req.raw)
    if (res.status === 401) await recordFailure(db, keys)
    else if (res.ok) {
      await clearFailures(db, keys)
      // The right temporary password, but too old: no session (and no cookie) for it.
      if (keys.email && (await refuseExpiredTempPassword(db, keys.email))) {
        const message = TEMP_PASSWORD_EXPIRED_MESSAGE
        return c.json({ code: 'TEMP_PASSWORD_EXPIRED', message, error: message }, 403)
      }
      const signedIn = (await res
        .clone()
        .json()
        .catch(() => null)) as { token?: unknown } | null
      const token = typeof signedIn?.token === 'string' ? signedIn.token : null
      // Blocked by staff: the right password, but no session (in either app).
      if (keys.email && (await refuseBlocked(db, keys.email, token))) {
        const message = BLOCKED_MESSAGE
        return c.json({ code: 'BLOCKED', message, error: message }, 403)
      }
      // The admin lets only staff in: a client's right password gets no session there.
      if (c.var.appKind === 'admin' && keys.email) {
        if (await refuseNonStaff(db, keys.email, token)) {
          const message = STAFF_ONLY_MESSAGE
          return c.json({ code: 'STAFF_ONLY', message, error: message }, 403)
        }
      }
    }
    return res
  })
  // Only the Better Auth endpoints the apps use. Everything else it offers (update-user,
  // list-sessions, password-reset links …) would go around our validators and guards.
  app.post('/auth/sign-out', (c) => c.var.auth.handler(c.req.raw))
  app.get('/auth/get-session', (c) => c.var.auth.handler(c.req.raw))
  // Changing your own password (Profile / Settings), never while a temporary one must be replaced.
  app.post('/auth/change-password', async (c) => {
    const session = await c.var.auth.api.getSession({
      headers: c.req.raw.headers,
      query: { disableCookieCache: true },
    })
    if (!session) return c.json({ error: 'Not signed in' }, 401)
    if (session.user.mustChangePassword)
      return c.json({ error: 'Choose your own password first', code: 'CHOOSE_PASSWORD' }, 403)
    return c.var.auth.handler(c.req.raw)
  })
  app.all('/auth/*', (c) => c.json({ error: 'Not found' }, 404))
  // For an uptime monitor: 200 only when the Worker and the database both answer.
  app.get('/health', async (c) => {
    try {
      await c.env.DB.prepare('select 1').first()
      return c.json({ ok: true })
    } catch (err) {
      console.error('[health] database', err)
      return c.json({ ok: false, error: 'Database unavailable' }, 503)
    }
  })
  mountMedia(app)
  app.route('/me', meRoutes)
  app.route('/exercises', exerciseRoutes)
  app.route('/workouts', workoutRoutes)
  app.route('/programs', programRoutes)
  app.route('/enrollments', enrollmentRoutes)
  app.route('/sessions', sessionRoutes)
  app.route('/admin/users', adminUserRoutes)
  app.route('/admin/overview', adminOverviewRoutes)
  app.route('/admin/email', adminEmailRoutes)
  app.route('/admin/chat', adminChatRoutes)
  app.route('/admin/settings', adminSettingsRoutes)
  app.route('/videos', videoRoutes)
  app.route('/workout-builder', workoutBuilderRoutes)
  app.route('/program-builder', programBuilderRoutes)

  app.notFound((c) => c.json({ error: 'Not found' }, 404))
  app.onError((err, c) => {
    if (err instanceof HTTPException)
      return c.json({ error: err.message || 'This request isn’t allowed' }, err.status)
    console.error(err)
    return c.json({ error: 'Something went wrong' }, 500)
  })

  return app
}

export type App = ReturnType<typeof createApp>
