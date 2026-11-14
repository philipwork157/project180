import { foodPhotoSettingsInput, isOwner } from '@project180/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { forbidden, parseBody } from '../errors'
import { requireAdmin, requireUser } from '../middleware'
import { foodPhotoSettings, setFoodPhotos } from '../settings'

/** Site-wide switches. Every coach can see them; only an owner can change them. */
export const adminSettingsRoutes = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get('/food-photos', async (c) =>
    c.json({ foodPhotos: await foodPhotoSettings(c.var.db, c.env) }),
  )
  .put('/food-photos', async (c) => {
    const { db, user } = c.var
    if (!isOwner(user.role)) forbidden('Only an owner can change this')
    const { enabled } = await parseBody(c.req.raw, foodPhotoSettingsInput)
    await setFoodPhotos(db, enabled, user.id)
    return c.json({ foodPhotos: await foodPhotoSettings(db, c.env) })
  })
