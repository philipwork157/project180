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
    bodyGoal: row?.bodyGoal ?? null,
    focusAreas: (row?.focusAreas ?? []) as ClientProfile['focusAreas'],
    places: (row?.places ?? []) as ClientProfile['places'],
    experience: row?.experience ?? null,
    daysPerWeek: row?.daysPerWeek ?? null,
    targetEvent: row?.targetEvent ?? null,
    targetEventDate: row?.targetEventDate ?? null,
    raceKind: row?.raceKind ?? null,
    goalTimeSeconds: row?.goalTimeSeconds ?? null,
    bestTimeSeconds: row?.bestTimeSeconds ?? null,
    maxHr: row?.maxHr ?? null,
    restingHr: row?.restingHr ?? null,
    thresholdPaceSeconds: row?.thresholdPaceSeconds ?? null,
    ftpWatts: row?.ftpWatts ?? null,
    notes: row?.notes ?? null,
    latestWeightKg: weight?.weightKg ?? null,
  }
}

/**
 * Saves a profile. Goal weight, activity level, the race goal and endurance numbers left out
 * (undefined) stay as they are: the phone app never sends them, because only the coach sets them.
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
    ...(input.bodyGoal === undefined ? {} : { bodyGoal: input.bodyGoal }),
    // The main goal isn't repeated in the extra focus areas.
    focusAreas: input.focusAreas.filter((g) => g !== input.mainGoal),
    places: input.places,
    experience: input.experience ?? null,
    daysPerWeek: input.daysPerWeek ?? null,
    targetEvent: input.targetEvent ?? null,
    targetEventDate: input.targetEventDate ?? null,
    ...keepIfLeftOut({
      raceKind: input.raceKind,
      goalTimeSeconds: input.goalTimeSeconds,
      bestTimeSeconds: input.bestTimeSeconds,
      maxHr: input.maxHr,
      restingHr: input.restingHr,
      thresholdPaceSeconds: input.thresholdPaceSeconds,
      ftpWatts: input.ftpWatts,
    }),
    notes: input.notes ?? null,
  }
  await db
    .insert(clientProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: clientProfiles.userId, set: values })
}

/** Only the values that were sent: undefined (left out) keeps what's saved, null clears it. */
function keepIfLeftOut<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>
  }
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
