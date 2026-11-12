import { createDb } from '@project180/db'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { createAuth } from './auth'
import type { AppEnv, Bindings } from './env'
import { mountMedia } from './media'
import { adminEmailRoutes } from './routes/admin-email'
import { adminOverviewRoutes } from './routes/admin-overview'
import { adminUserRoutes } from './routes/admin-users'
import { enrollmentRoutes } from './routes/enrollments'
import { exerciseRoutes } from './routes/exercises'
import { meRoutes } from './routes/me'
import { programRoutes } from './routes/programs'
import { sessionRoutes } from './routes/sessions'
import { videoRoutes } from './routes/videos'
import { workoutRoutes } from './routes/workouts'
import { clearFailures, minutesLocked, recordFailure } from './sign-in-limit'
import { refuseExpiredTempPassword, TEMP_PASSWORD_EXPIRED_MESSAGE } from './temp-password'

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
    c.set('auth', createAuth(c.env))
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
    }
    return res
  })
  app.on(['GET', 'POST'], '/auth/*', (c) => c.var.auth.handler(c.req.raw))
  app.get('/health', (c) => c.json({ ok: true }))
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
  app.route('/videos', videoRoutes)

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
