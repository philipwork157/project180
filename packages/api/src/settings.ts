// Site-wide switches the owner sets in the admin (app_settings, one row per key).
import { appSettings, type Db, users } from '@project180/db'
import {
  DEFAULT_FOOD_PHOTOS_PER_DAY,
  type FoodPhotoSettings,
  isOwner,
  MAX_FOOD_PHOTOS_PER_DAY,
  OWNER_FOOD_PHOTOS_PER_DAY,
  type Role,
} from '@project180/shared'
import { eq, inArray } from 'drizzle-orm'
import type { Bindings } from './env'
import { foodPhotosConfigured } from './food-photo'

const FOOD_PHOTOS = 'food_photos'
const FOOD_PHOTOS_PER_DAY = 'food_photos_per_day'

const asLimit = (value: string | undefined) => {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= MAX_FOOD_PHOTOS_PER_DAY
    ? n
    : DEFAULT_FOOD_PHOTOS_PER_DAY
}

/** The owner's photo-estimate switch, the default daily limit, and whether there's a Claude key. */
export async function foodPhotoSettings(db: Db, env: Bindings): Promise<FoodPhotoSettings> {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value, updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .where(inArray(appSettings.key, [FOOD_PHOTOS, FOOD_PHOTOS_PER_DAY]))
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const switched = byKey.get(FOOD_PHOTOS)
  const limit = byKey.get(FOOD_PHOTOS_PER_DAY)
  const updated = rows.map((r) => r.updatedAt.getTime())
  return {
    enabled: switched ? switched.value !== 'off' : true,
    configured: foodPhotosConfigured(env),
    perDay: asLimit(limit?.value),
    updatedAt: updated.length ? new Date(Math.max(...updated)).toISOString() : null,
  }
}

/** Can people take food photos right now? Needs the key and the owner's switch on. */
export async function foodPhotosAvailable(db: Db, env: Bindings): Promise<boolean> {
  if (!foodPhotosConfigured(env)) return false
  return (await foodPhotoSettings(db, env)).enabled
}

async function setSetting(db: Db, key: string, value: string, ownerId: number) {
  const values = { value, updatedBy: ownerId }
  await db
    .insert(appSettings)
    .values({ key, ...values })
    .onConflictDoUpdate({ target: appSettings.key, set: { ...values, updatedAt: new Date() } })
}

export const setFoodPhotos = (db: Db, enabled: boolean, ownerId: number) =>
  setSetting(db, FOOD_PHOTOS, enabled ? 'on' : 'off', ownerId)

export const setFoodPhotoLimit = (db: Db, perDay: number, ownerId: number) =>
  setSetting(db, FOOD_PHOTOS_PER_DAY, String(perDay), ownerId)

/**
 * How many photo estimates this person may take a day: owners get the safety-net number,
 * everyone else their own limit (set by their coach) or else the site default.
 */
export async function photoLimitFor(
  db: Db,
  env: Bindings,
  person: { id: number; role: Role },
): Promise<number> {
  if (isOwner(person.role)) return OWNER_FOOD_PHOTOS_PER_DAY
  const [[row], settings] = await Promise.all([
    db.select({ perDay: users.foodPhotosPerDay }).from(users).where(eq(users.id, person.id)),
    foodPhotoSettings(db, env),
  ])
  return row?.perDay ?? settings.perDay
}
