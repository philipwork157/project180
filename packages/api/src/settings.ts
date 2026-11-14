// Site-wide switches the owner sets in the admin (app_settings, one row per key).
import { appSettings, type Db } from '@project180/db'
import type { FoodPhotoSettings } from '@project180/shared'
import { eq } from 'drizzle-orm'
import type { Bindings } from './env'
import { foodPhotosConfigured } from './food-photo'

const FOOD_PHOTOS = 'food_photos'

/** The owner's photo-estimate switch and whether this site has a Claude key. On by default. */
export async function foodPhotoSettings(db: Db, env: Bindings): Promise<FoodPhotoSettings> {
  const [row] = await db
    .select({ value: appSettings.value, updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .where(eq(appSettings.key, FOOD_PHOTOS))
  return {
    enabled: row ? row.value !== 'off' : true,
    configured: foodPhotosConfigured(env),
    updatedAt: row?.updatedAt.toISOString() ?? null,
  }
}

/** Can people take food photos right now? Needs the key and the owner's switch on. */
export async function foodPhotosAvailable(db: Db, env: Bindings): Promise<boolean> {
  if (!foodPhotosConfigured(env)) return false
  return (await foodPhotoSettings(db, env)).enabled
}

export async function setFoodPhotos(db: Db, enabled: boolean, ownerId: number) {
  const values = { value: enabled ? 'on' : 'off', updatedBy: ownerId }
  await db
    .insert(appSettings)
    .values({ key: FOOD_PHOTOS, ...values })
    .onConflictDoUpdate({ target: appSettings.key, set: { ...values, updatedAt: new Date() } })
}
