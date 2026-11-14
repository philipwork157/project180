import { users } from '@project180/db'
import { isStaff } from '@project180/shared'
import { eq } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import type { AppEnv } from './env'
import { withinLimit } from './rate-limit'
import { toMe } from './users'

/** How often "last seen" is written: at most once per this many ms per person. */
const SEEN_EVERY_MS = 2 * 60 * 1000

/**
 * When this Worker last wrote someone's "last seen". With the cookie cache on, the user in
 * the cookie keeps an old lastSeenAt for a while, so without this every call would write.
 */
const seenWritten = new Map<number, number>()

/** While someone still has a temporary password, these are the only calls they may make. */
const ALLOWED_BEFORE_CHOOSING = new Set(['GET /api/me', 'POST /api/me/first-password'])

/**
 * 401 unless signed in; puts the user on c.var.user. Also notes when they were last seen, and
 * blocks everything but choosing a password while they still have a temporary one.
 */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const { auth } = c.var
  const headers = c.req.raw.headers
  let result = await auth.api.getSession({ headers, returnHeaders: true })
  // A temporary password in the cached cookie may already be changed: ask the database.
  if (result.response?.user.mustChangePassword) {
    result = await auth.api.getSession({
      headers,
      query: { disableCookieCache: true },
      returnHeaders: true,
    })
  }
  const session = result.response
  if (!session) return c.json({ error: 'Not signed in' }, 401)
  const me = toMe(session.user)
  if (c.var.appKind === 'admin' && !isStaff(me.role)) return c.json({ error: 'Not signed in' }, 401)
  c.set('user', me)
  c.set('sessionId', Number(session.session.id))

  if (!(await withinLimit(c.env.API_LIMIT, `user:${me.id}`)))
    return c.json({ error: 'Too many requests. Please wait a minute.' }, 429)

  const lastSeen = Math.max(
    session.user.lastSeenAt ? new Date(session.user.lastSeenAt as Date | string).getTime() : 0,
    seenWritten.get(me.id) ?? 0,
  )
  const now = Date.now()
  if (now - lastSeen > SEEN_EVERY_MS) {
    seenWritten.set(me.id, now)
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
  // A refreshed session or cookie cache from Better Auth goes back to the browser.
  for (const cookie of result.headers.getSetCookie()) c.res.headers.append('set-cookie', cookie)
})

/** 403 unless the signed-in user is staff (an owner or a coach). Use after requireUser. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (!isStaff(c.var.user.role)) return c.json({ error: 'Admins only' }, 403)
  await next()
})
