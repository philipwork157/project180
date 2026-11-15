import { programBuildInput } from '@project180/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../env'
import { parseBody } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import { buildProgram } from '../program-builder'
import { assertCanSend } from '../rate-limit'
import { workoutBuilderSettings } from '../settings'

/**
 * "Build with Claude" for programs (staff only): describe a program, get a new one in the
 * library. This route can only create; editing stays in the normal program editor. It shares
 * the owner's Build with Claude switch with workouts.
 */
export const programBuilderRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .post('/', async (c) => {
    const { db, user } = c.var
    const settings = await workoutBuilderSettings(db, c.env)
    if (!settings.configured)
      throw new HTTPException(503, { message: 'Build with Claude isn’t set up yet.' })
    if (!settings.enabled)
      throw new HTTPException(403, { message: 'Build with Claude is turned off in Settings.' })
    // A few builds a minute at most (shares the chat send limit).
    await assertCanSend(c.env.SEND_LIMIT, user.id)
    const { prompt } = await parseBody(c.req.raw, programBuildInput)
    return c.json(await buildProgram(db, c.env, user, prompt), 201)
  })
