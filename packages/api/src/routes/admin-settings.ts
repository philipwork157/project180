import { claudeFeatureInput, foodPhotoSettingsInput, isOwner } from '@project180/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { forbidden, parseBody } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import {
  foodPhotoSettings,
  setFoodPhotoLimit,
  setFoodPhotos,
  setWorkoutBuilder,
  workoutBuilderSettings,
} from '../settings'

/** Site-wide switches. Every coach can see them; only an owner can change them. */
export const adminSettingsRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get('/food-photos', async (c) =>
    c.json({ foodPhotos: await foodPhotoSettings(c.var.db, c.env) }),
  )
  .put('/food-photos', async (c) => {
    const { db, user } = c.var
    if (!isOwner(user.role)) forbidden('Only an owner can change this')
    const { enabled, perDay } = await parseBody(c.req.raw, foodPhotoSettingsInput)
    if (enabled !== undefined) await setFoodPhotos(db, enabled, user.id)
    if (perDay !== undefined) await setFoodPhotoLimit(db, perDay, user.id)
    return c.json({ foodPhotos: await foodPhotoSettings(db, c.env) })
  })
  .get('/workout-builder', async (c) =>
    c.json({ workoutBuilder: await workoutBuilderSettings(c.var.db, c.env) }),
  )
  .put('/workout-builder', async (c) => {
    const { db, user } = c.var
    if (!isOwner(user.role)) forbidden('Only an owner can change this')
    const { enabled } = await parseBody(c.req.raw, claudeFeatureInput)
    await setWorkoutBuilder(db, enabled, user.id)
    return c.json({ workoutBuilder: await workoutBuilderSettings(db, c.env) })
  })
