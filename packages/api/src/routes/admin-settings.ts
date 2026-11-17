import { foodPhotoSettingsInput, isOwner } from '@project180/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { forbidden, parseBody } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import { builderSettings, foodPhotoSettings, setFoodPhotoLimit } from '../settings'

/**
 * The business's own settings. Every coach can see them; only an owner can change its default
 * photo limit. Switching Claude features on or off, models and hard limits are the platform admin's
 * (routes/platform.ts), so these only report them.
 */
export const adminSettingsRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get('/food-photos', async (c) =>
    c.json({ foodPhotos: await foodPhotoSettings(c.var.db, c.env, c.var.user.businessId) }),
  )
  .put('/food-photos', async (c) => {
    const { db, user } = c.var
    if (!isOwner(user.role)) forbidden('Only an owner can change this')
    const { perDay } = await parseBody(c.req.raw, foodPhotoSettingsInput)
    if (user.businessId === null) forbidden('Only an owner can change this')
    await setFoodPhotoLimit(db, user.businessId, perDay)
    return c.json({ foodPhotos: await foodPhotoSettings(db, c.env, user.businessId) })
  })
  .get('/workout-builder', async (c) =>
    c.json({ workoutBuilder: await builderSettings(c.var.db, c.env) }),
  )
