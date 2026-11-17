import { workoutBuildInput } from '@project180/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { assertWithinClaudeLimit, type ClaudeMeter, recordClaudeCall } from '../claude-calls'
import type { AppEnv } from '../env'
import { parseBody } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import { assertCanSend } from '../rate-limit'
import { claudeFeature } from '../settings'
import { buildWorkout } from '../workout-builder'

/**
 * "Build with Claude" for staff: describe a workout, get a new one in the library. This route
 * can only create; editing stays in the normal workout editor. The platform admin switches it
 * on or off, picks the model and sets the daily limit; every call is saved with its cost.
 */
export const workoutBuilderRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  /** Is the button shown? Needs the Claude key and the platform admin's switch on. */
  .get('/', async (c) => {
    const f = await claudeFeature(c.var.db, c.env, 'workout_builder')
    return c.json({ available: f.enabled && f.configured && f.limitPerDay > 0 })
  })
  .post('/', async (c) => {
    const { db, user } = c.var
    const f = await claudeFeature(db, c.env, 'workout_builder')
    if (!f.configured)
      throw new HTTPException(503, { message: 'Build with Claude isn’t set up yet.' })
    if (!f.enabled)
      throw new HTTPException(403, { message: 'Build with Claude is turned off at the moment.' })
    // A few builds a minute at most (shares the chat send limit), and the hard daily limit.
    await assertCanSend(c.env.SEND_LIMIT, user.id)
    await assertWithinClaudeLimit(db, user.id, 'workout_builder', f.limitPerDay)
    const { prompt } = await parseBody(c.req.raw, workoutBuildInput)
    const meter: ClaudeMeter = { model: f.model }
    try {
      return c.json(await buildWorkout(db, c.env, user, prompt, meter), 201)
    } finally {
      // Only calls that reached Claude are saved (a library problem before it costs nothing).
      if (meter.outcome || meter.usage || meter.failReason)
        await recordClaudeCall(db, user.id, 'workout_builder', meter)
    }
  })
