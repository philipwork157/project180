import { users } from '@project180/db'
import { isStaff } from '@project180/shared'
import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './env'
import { toMe } from './users'

/** How often "last seen" is written: at most once per this many ms per person. */
const SEEN_EVERY_MS = 2 * 60 * 1000

/** While someone still has a temporary password, these are the only calls they may make. */
const ALLOWED_BEFORE_CHOOSING = new Set(['GET /api/me', 'POST /api/me/first-password'])

/**
 * 401 unless signed in; puts the user on c.var.user. Also notes when they were last seen, and
 * blocks everything but choosing a password while they still have a temporary one.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers })
  if (!session) return c.json({ error: 'Not signed in' }, 401)
  const me = toMe(session.user)
  c.set('user', me)
  c.set('sessionId', Number(session.session.id))

  const lastSeen = session.user.lastSeenAt
    ? new Date(session.user.lastSeenAt as Date | string).getTime()
    : 0
  const now = Date.now()
  if (now - lastSeen > SEEN_EVERY_MS) {
    await c.var.db
      .update(users)
      .set({ lastSeenAt: new Date(now) })
      .where(eq(users.id, me.id))
  }

  const path = c.req.path.replace(/\/$/, '')
  if (me.mustChangePassword && !ALLOWED_BEFORE_CHOOSING.has(`${c.req.method} ${path}`)) {
    return c.json({ error: 'Choose your own password first', code: 'CHOOSE_PASSWORD' }, 403)
  }
  await next()
})

/** 403 unless the signed-in user is staff (an owner or a coach). Use after requireUser. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isStaff(c.var.user.role)) return c.json({ error: 'Admins only' }, 403)
  await next()
})
