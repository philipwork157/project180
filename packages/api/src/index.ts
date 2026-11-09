import { createDb } from '@project180/db'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { createAuth } from './auth'
import type { AppEnv } from './env'
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

export type { Bindings } from './env'

/** The whole API, mounted at /api. The web app's Worker serves it. */
export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api')

  app.use('*', async (c, next) => {
    c.set('db', createDb(c.env.DB))
    c.set('auth', createAuth(c.env))
    await next()
  })

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
    else if (res.ok) await clearFailures(db, keys)
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
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'Something went wrong' }, 500)
  })

  return app
}

export type App = ReturnType<typeof createApp>
