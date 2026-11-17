// Site-wide settings (app_settings, one row per key). The owner sets the default photo limit;
// the platform admin sets everything about Claude: which features are on, their models and the
// hard daily limits.
import { appSettings, businesses, type Db, users } from '@project180/db'
import {
  CLAUDE_FEATURES,
  CLAUDE_MODEL_IDS,
  type ClaudeConfig,
  type ClaudeFeature,
  type ClaudeFeatureConfig,
  type ClaudeFeatureSettings,
  DEFAULT_CLAUDE_LIMITS,
  DEFAULT_CLAUDE_MODEL,
  DEFAULT_FOOD_PHOTOS_PER_DAY,
  type FoodPhotoSettings,
  isOwner,
  MAX_CLAUDE_LIMIT,
  type Role,
} from '@project180/shared'
import { eq, inArray } from 'drizzle-orm'
import type { Bindings } from './env'
import { foodPhotosConfigured } from './food-photo'

// Before the platform admin existed, owners switched these; still read as the starting value.
const LEGACY_SWITCH: Record<ClaudeFeature, string> = {
  food_photo: 'food_photos',
  workout_builder: 'workout_builder',
  program_builder: 'workout_builder',
}
const claudeKey = (feature: ClaudeFeature, part: 'enabled' | 'model' | 'limit') =>
  `claude.${feature}.${part}`

/** The model a feature uses: the platform admin's pick, else the Worker's variable, else ours. */
function modelFor(env: Bindings, feature: ClaudeFeature, picked: string | undefined) {
  if (picked && CLAUDE_MODEL_IDS.includes(picked)) return picked
  const fromEnv = feature === 'food_photo' ? env.FOOD_MODEL : env.WORKOUT_MODEL
  return fromEnv || DEFAULT_CLAUDE_MODEL
}

const asClaudeLimit = (value: string | undefined, feature: ClaudeFeature) => {
  const n = Number(value)
  return value !== undefined && Number.isInteger(n) && n >= 0 && n <= MAX_CLAUDE_LIMIT
    ? n
    : DEFAULT_CLAUDE_LIMITS[feature]
}

/** Every Claude feature: on or off, its model and its hard daily limit (one read). */
export async function claudeConfig(db: Db, env: Bindings): Promise<ClaudeConfig> {
  const keys = [
    ...new Set([
      ...CLAUDE_FEATURES.flatMap((f) => [
        claudeKey(f, 'enabled'),
        claudeKey(f, 'model'),
        claudeKey(f, 'limit'),
      ]),
      ...Object.values(LEGACY_SWITCH),
    ]),
  ]
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value, updatedAt: appSettings.updatedAt })
    .from(appSettings)
    .where(inArray(appSettings.key, keys))
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const features: ClaudeFeatureConfig[] = CLAUDE_FEATURES.map((feature) => {
    const own = ['enabled', 'model', 'limit'] as const
    const switched = byKey.get(claudeKey(feature, 'enabled')) ?? byKey.get(LEGACY_SWITCH[feature])
    const times = [...own.map((part) => byKey.get(claudeKey(feature, part))), switched]
      .filter((r) => r !== undefined)
      .map((r) => r.updatedAt.getTime())
    return {
      feature,
      enabled: switched ? switched.value !== 'off' : true,
      model: modelFor(env, feature, byKey.get(claudeKey(feature, 'model'))?.value),
      limitPerDay: asClaudeLimit(byKey.get(claudeKey(feature, 'limit'))?.value, feature),
      updatedAt: times.length ? new Date(Math.max(...times)).toISOString() : null,
    }
  })
  return { configured: foodPhotosConfigured(env), features }
}

/** One feature's settings. */
export async function claudeFeature(
  db: Db,
  env: Bindings,
  feature: ClaudeFeature,
): Promise<ClaudeFeatureConfig & { configured: boolean }> {
  const config = await claudeConfig(db, env)
  const f = config.features.find((x) => x.feature === feature) as ClaudeFeatureConfig
  return { ...f, configured: config.configured }
}

/** The platform admin changes one feature. */
export async function setClaudeFeature(
  db: Db,
  input: { feature: ClaudeFeature; enabled?: boolean; model?: string; limitPerDay?: number },
  userId: number,
) {
  const { feature } = input
  if (input.enabled !== undefined)
    await setSetting(db, claudeKey(feature, 'enabled'), input.enabled ? 'on' : 'off', userId)
  if (input.model !== undefined)
    await setSetting(db, claudeKey(feature, 'model'), input.model, userId)
  if (input.limitPerDay !== undefined)
    await setSetting(db, claudeKey(feature, 'limit'), String(input.limitPerDay), userId)
}

/**
 * Photo estimates as an owner sees them: on or off (the platform admin's switch), their
 * business's default daily limit, and whether there's a Claude key.
 */
export async function foodPhotoSettings(
  db: Db,
  env: Bindings,
  businessId: number | null,
): Promise<FoodPhotoSettings> {
  const [[business], photo] = await Promise.all([
    businessId === null
      ? Promise.resolve([])
      : db
          .select({ perDay: businesses.foodPhotosPerDay, updatedAt: businesses.updatedAt })
          .from(businesses)
          .where(eq(businesses.id, businessId)),
    claudeFeature(db, env, 'food_photo'),
  ])
  const perDay = business?.perDay ?? DEFAULT_FOOD_PHOTOS_PER_DAY
  return {
    enabled: photo.enabled,
    configured: photo.configured,
    perDay: Math.min(perDay, photo.limitPerDay),
    updatedAt: business?.perDay != null ? business.updatedAt.toISOString() : null,
  }
}

/** Can people take food photos right now? Needs the key and the platform admin's switch on. */
export async function foodPhotosAvailable(db: Db, env: Bindings): Promise<boolean> {
  if (!foodPhotosConfigured(env)) return false
  return (await claudeFeature(db, env, 'food_photo')).enabled
}

async function setSetting(db: Db, key: string, value: string, ownerId: number) {
  const values = { value, updatedBy: ownerId }
  await db
    .insert(appSettings)
    .values({ key, ...values })
    .onConflictDoUpdate({ target: appSettings.key, set: { ...values, updatedAt: new Date() } })
}

/** An owner sets their business's default photo limit. */
export async function setFoodPhotoLimit(db: Db, businessId: number, perDay: number) {
  await db.update(businesses).set({ foodPhotosPerDay: perDay }).where(eq(businesses.id, businessId))
}

/**
 * How many photo estimates this person may take a day: their own limit (set by their coach) or
 * else the site default, never past the platform admin's hard limit. Owners get the hard limit
 * itself as their safety net.
 */
export async function photoLimitFor(
  db: Db,
  env: Bindings,
  person: { id: number; role: Role; businessId: number | null },
): Promise<number> {
  const [[row], settings, photo] = await Promise.all([
    db.select({ perDay: users.foodPhotosPerDay }).from(users).where(eq(users.id, person.id)),
    foodPhotoSettings(db, env, person.businessId),
    claudeFeature(db, env, 'food_photo'),
  ])
  if (isOwner(person.role)) return photo.limitPerDay
  return Math.min(row?.perDay ?? settings.perDay, photo.limitPerDay)
}

/** The Build with Claude switch for workouts or programs, as the owner and coaches see it. */
export async function builderSettings(
  db: Db,
  env: Bindings,
  feature: 'workout_builder' | 'program_builder' = 'workout_builder',
): Promise<ClaudeFeatureSettings> {
  const f = await claudeFeature(db, env, feature)
  return { enabled: f.enabled, configured: f.configured, updatedAt: f.updatedAt }
}
