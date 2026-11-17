import { programBuildInput } from '@project180/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { assertWithinClaudeLimit, type ClaudeMeter, recordClaudeCall } from '../claude-calls'
import type { AppEnv } from '../env'
import { parseBody } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import { buildProgram } from '../program-builder'
import { assertCanSend } from '../rate-limit'
import { claudeFeature } from '../settings'

/**
 * "Build with Claude" for programs (staff only): describe a program, get a new one in the
 * library. This route can only create; editing stays in the normal program editor. Its own
 * switch, model and daily limit are set by the platform admin; every call is saved with its cost.
 */
export const programBuilderRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  /** Is the button shown? */
  .get('/', async (c) => {
    const f = await claudeFeature(c.var.db, c.env, 'program_builder')
    return c.json({ available: f.enabled && f.configured && f.limitPerDay > 0 })
  })
  .post('/', async (c) => {
    const { db, user } = c.var
    const f = await claudeFeature(db, c.env, 'program_builder')
    if (!f.configured)
      throw new HTTPException(503, { message: 'Build with Claude isn’t set up yet.' })
    if (!f.enabled)
      throw new HTTPException(403, {
        message: 'Building programs with Claude is turned off at the moment.',
      })
    // A few builds a minute at most (shares the chat send limit), and the hard daily limit.
    await assertCanSend(c.env.SEND_LIMIT, user.id)
    await assertWithinClaudeLimit(db, user.id, 'program_builder', f.limitPerDay)
    const { prompt } = await parseBody(c.req.raw, programBuildInput)
    const meter: ClaudeMeter = { model: f.model }
    try {
      return c.json(await buildProgram(db, c.env, user, prompt, meter), 201)
    } finally {
      if (meter.outcome || meter.usage || meter.failReason)
        await recordClaudeCall(db, user.id, 'program_builder', meter)
    }
  })
