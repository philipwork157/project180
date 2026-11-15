import { workoutBuildInput } from '@project180/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../env'
import { parseBody } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import { assertCanSend } from '../rate-limit'
import { workoutBuilderSettings } from '../settings'
import { buildWorkout } from '../workout-builder'

/**
 * "Build with Claude" for staff: describe a workout, get a new one in the library. This route
 * can only create; editing stays in the normal workout editor.
 */
export const workoutBuilderRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  /** Is the button shown? Needs the Claude key and the owner's switch on. */
  .get('/', async (c) => {
    const s = await workoutBuilderSettings(c.var.db, c.env)
    return c.json({ available: s.enabled && s.configured })
  })
  .post('/', async (c) => {
    const { db, user } = c.var
    const settings = await workoutBuilderSettings(db, c.env)
    if (!settings.configured)
      throw new HTTPException(503, { message: 'Build with Claude isn’t set up yet.' })
    if (!settings.enabled)
      throw new HTTPException(403, { message: 'Build with Claude is turned off in Settings.' })
    // A few builds a minute at most (shares the chat send limit).
    await assertCanSend(c.env.SEND_LIMIT, user.id)
    const { prompt } = await parseBody(c.req.raw, workoutBuildInput)
    return c.json(await buildWorkout(db, c.env, user, prompt), 201)
  })
