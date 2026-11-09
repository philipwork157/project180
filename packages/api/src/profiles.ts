// Client profiles: contact, body basics and goals, captured by the new-client wizard.
import { bodyCheckins, clientProfiles, type Db } from '@project180/db'
import type { ClientProfile, clientProfileInput } from '@project180/shared'
import { desc, eq } from 'drizzle-orm'

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

export async function saveProfile(db: Db, userId: number, input: ProfileInput) {
  const values = {
    phone: input.phone ?? null,
    birthDate: input.birthDate ?? null,
    sex: input.sex ?? null,
    heightCm: input.heightCm ?? null,
    goalWeightKg: input.goalWeightKg ?? null,
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

/** Today's weight as a weigh-in (replaces any weigh-in already logged today). */
export async function logWeight(db: Db, userId: number, date: string, weightKg: number) {
  await db
    .insert(bodyCheckins)
    .values({ clientUuid: crypto.randomUUID(), userId, date, weightKg })
    .onConflictDoUpdate({ target: [bodyCheckins.userId, bodyCheckins.date], set: { weightKg } })
}
