// Client profiles: contact, body basics and goals, captured by the new-client wizard.
import { bodyCheckins, clientProfiles, type Db } from '@project180/db'
import type { ClientProfile, clientProfileInput, nutritionTargetsInput } from '@project180/shared'
import { and, desc, eq, isNotNull } from 'drizzle-orm'

type ProfileInput = ReturnType<typeof clientProfileInput.parse>

export async function loadProfile(db: Db, userId: number): Promise<ClientProfile> {
  const [row] = await db.select().from(clientProfiles).where(eq(clientProfiles.userId, userId))
  const [weight] = await db
    .select({ weightKg: bodyCheckins.weightKg })
    .from(bodyCheckins)
    .where(eq(bodyCheckins.userId, userId))
    .orderBy(desc(bodyCheckins.date))
    .limit(1)
  return {
    phone: row?.phone ?? null,
    birthDate: row?.birthDate ?? null,
    sex: row?.sex ?? null,
    heightCm: row?.heightCm ?? null,
    goalWeightKg: row?.goalWeightKg ?? null,
    activityLevel: row?.activityLevel ?? null,
    weeklyChangeKg: row?.weeklyChangeKg ?? null,
    mainGoal: row?.mainGoal ?? null,
    focusAreas: (row?.focusAreas ?? []) as ClientProfile['focusAreas'],
    places: (row?.places ?? []) as ClientProfile['places'],
    experience: row?.experience ?? null,
    daysPerWeek: row?.daysPerWeek ?? null,
    targetEvent: row?.targetEvent ?? null,
    targetEventDate: row?.targetEventDate ?? null,
    notes: row?.notes ?? null,
    latestWeightKg: weight?.weightKg ?? null,
  }
}

/**
 * Saves a profile. Goal weight and activity level left out (undefined) stay as they are: the
 * phone app never sends them, because only the coach sets them.
 */
export async function saveProfile(db: Db, userId: number, input: ProfileInput) {
  const values = {
    phone: input.phone ?? null,
    birthDate: input.birthDate ?? null,
    sex: input.sex ?? null,
    heightCm: input.heightCm ?? null,
    ...(input.goalWeightKg === undefined ? {} : { goalWeightKg: input.goalWeightKg }),
    ...(input.activityLevel === undefined ? {} : { activityLevel: input.activityLevel }),
    mainGoal: input.mainGoal ?? null,
    // The main goal isn't repeated in the extra focus areas.
    focusAreas: input.focusAreas.filter((g) => g !== input.mainGoal),
    places: input.places,
    experience: input.experience ?? null,
    daysPerWeek: input.daysPerWeek ?? null,
    targetEvent: input.targetEvent ?? null,
    targetEventDate: input.targetEventDate ?? null,
    notes: input.notes ?? null,
  }
  await db
    .insert(clientProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: clientProfiles.userId, set: values })
}

/** What the calorie calculator was set to, saved with the daily targets (coach only). */
export function savePlanSettings(db: Db, userId: number, plan: PlanSettings) {
  const values = {
    activityLevel: plan.activityLevel,
    weeklyChangeKg: plan.weeklyChangeKg,
    goalWeightKg: plan.goalWeightKg,
    ...(plan.birthDate === undefined ? {} : { birthDate: plan.birthDate }),
    ...(plan.sex === undefined ? {} : { sex: plan.sex }),
    ...(plan.heightCm === undefined ? {} : { heightCm: plan.heightCm }),
  }
  return db
    .insert(clientProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: clientProfiles.userId,
      set: { ...values, updatedAt: new Date() },
    })
}

type PlanSettings = NonNullable<ReturnType<typeof nutritionTargetsInput.parse>['plan']>

/** Their latest weigh-in. */
export async function latestWeight(db: Db, userId: number): Promise<number | null> {
  const [row] = await db
    .select({ weightKg: bodyCheckins.weightKg })
    .from(bodyCheckins)
    .where(and(eq(bodyCheckins.userId, userId), isNotNull(bodyCheckins.weightKg)))
    .orderBy(desc(bodyCheckins.date))
    .limit(1)
  return row?.weightKg ?? null
}

/** Today's weight as a weigh-in (replaces any weigh-in already logged today). */
export async function logWeight(db: Db, userId: number, date: string, weightKg: number) {
  await weighInToday(db, userId, date, weightKg)
}

/** The same as a statement, to run in a batch. */
export function weighInToday(db: Db, userId: number, date: string, weightKg: number) {
  return db
    .insert(bodyCheckins)
    .values({ clientUuid: crypto.randomUUID(), userId, date, weightKg })
    .onConflictDoUpdate({ target: [bodyCheckins.userId, bodyCheckins.date], set: { weightKg } })
}
