// "Download my data": everything one person logged, as one JSON file (POPIA's right of access).
// Only ever the signed-in person's own rows. A fixed number of queries, each limited to them.
import {
  activityLogs,
  bodyCheckins,
  type Db,
  exercises,
  foodEntries,
  foodFavourites,
  messages,
  nutritionTargets,
  savedMeals,
  setLogs,
  stepLogs,
  users,
  waterLogs,
  workoutSessions,
  workouts,
} from '@project180/db'
import { EXPORT_VERSION, type Me } from '@project180/shared'
import { asc, eq } from 'drizzle-orm'
import { loadProfile } from './profiles'

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export async function exportMyData(db: Db, me: Me) {
  const [
    [account],
    profile,
    targets,
    sessions,
    sets,
    checkins,
    food,
    water,
    activities,
    steps,
    meals,
    chat,
    favourites,
  ] = await Promise.all([
    db
      .select({
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
        waterGoalMl: users.waterGoalMl,
        termsAcceptedAt: users.termsAcceptedAt,
      })
      .from(users)
      .where(eq(users.id, me.id)),
    loadProfile(db, me.id),
    db
      .select({
        kcal: nutritionTargets.kcal,
        proteinG: nutritionTargets.proteinG,
        carbsG: nutritionTargets.carbsG,
        fatG: nutritionTargets.fatG,
        updatedAt: nutritionTargets.updatedAt,
      })
      .from(nutritionTargets)
      .where(eq(nutritionTargets.userId, me.id)),
    db
      .select({
        id: workoutSessions.id,
        workout: workouts.name,
        status: workoutSessions.status,
        startedAt: workoutSessions.startedAt,
        endedAt: workoutSessions.endedAt,
        durationSeconds: workoutSessions.durationSeconds,
        feeling: workoutSessions.feeling,
        energy: workoutSessions.energy,
        notes: workoutSessions.notes,
      })
      .from(workoutSessions)
      .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
      .where(eq(workoutSessions.userId, me.id))
      .orderBy(asc(workoutSessions.startedAt)),
    db
      .select({
        sessionId: setLogs.sessionId,
        exercise: exercises.name,
        setNumber: setLogs.setNumber,
        warmUp: setLogs.isWarmup,
        weightKg: setLogs.weightKg,
        reps: setLogs.reps,
        durationSeconds: setLogs.durationSeconds,
        distanceM: setLogs.distanceM,
        rpe: setLogs.rpe,
        notes: setLogs.notes,
      })
      .from(setLogs)
      .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
      .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
      .where(eq(workoutSessions.userId, me.id))
      .orderBy(asc(setLogs.sessionId), asc(setLogs.setNumber)),
    db
      .select({
        date: bodyCheckins.date,
        weightKg: bodyCheckins.weightKg,
        bodyFatPct: bodyCheckins.bodyFatPct,
        waistCm: bodyCheckins.waistCm,
        hipsCm: bodyCheckins.hipsCm,
        chestCm: bodyCheckins.chestCm,
        armCm: bodyCheckins.armCm,
        thighCm: bodyCheckins.thighCm,
        notes: bodyCheckins.notes,
      })
      .from(bodyCheckins)
      .where(eq(bodyCheckins.userId, me.id))
      .orderBy(asc(bodyCheckins.date)),
    db
      .select({
        date: foodEntries.date,
        meal: foodEntries.meal,
        name: foodEntries.name,
        grams: foodEntries.grams,
        kcal: foodEntries.kcal,
        proteinG: foodEntries.proteinG,
        carbsG: foodEntries.carbsG,
        fatG: foodEntries.fatG,
        fibreG: foodEntries.fibreG,
        sugarG: foodEntries.sugarG,
        sodiumMg: foodEntries.sodiumMg,
      })
      .from(foodEntries)
      .where(eq(foodEntries.userId, me.id))
      .orderBy(asc(foodEntries.date), asc(foodEntries.id)),
    db
      .select({ date: waterLogs.date, ml: waterLogs.ml, at: waterLogs.createdAt })
      .from(waterLogs)
      .where(eq(waterLogs.userId, me.id))
      .orderBy(asc(waterLogs.date), asc(waterLogs.id)),
    db
      .select({
        date: activityLogs.date,
        kind: activityLogs.kind,
        minutes: activityLogs.minutes,
        kcal: activityLogs.kcal,
      })
      .from(activityLogs)
      .where(eq(activityLogs.userId, me.id))
      .orderBy(asc(activityLogs.date)),
    db
      .select({ date: stepLogs.date, steps: stepLogs.steps })
      .from(stepLogs)
      .where(eq(stepLogs.userId, me.id))
      .orderBy(asc(stepLogs.date)),
    db
      .select({ name: savedMeals.name, items: savedMeals.items })
      .from(savedMeals)
      .where(eq(savedMeals.userId, me.id)),
    db
      .select({ senderId: messages.senderId, body: messages.body, at: messages.createdAt })
      .from(messages)
      .where(eq(messages.clientId, me.id))
      .orderBy(asc(messages.id)),
    db
      .select({
        name: foodFavourites.name,
        grams: foodFavourites.grams,
        kcal: foodFavourites.kcal,
        proteinG: foodFavourites.proteinG,
        carbsG: foodFavourites.carbsG,
        fatG: foodFavourites.fatG,
      })
      .from(foodFavourites)
      .where(eq(foodFavourites.userId, me.id)),
  ])

  const setsBySession = new Map<number, Array<Omit<(typeof sets)[number], 'sessionId'>>>()
  for (const { sessionId, ...set } of sets) {
    const list = setsBySession.get(sessionId) ?? []
    list.push(set)
    setsBySession.set(sessionId, list)
  }

  return {
    about:
      'Everything you logged in Project 180, as of the date below. Weights are kg, times are UTC.',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    account: account
      ? {
          ...account,
          createdAt: iso(account.createdAt),
          termsAcceptedAt: iso(account.termsAcceptedAt),
        }
      : null,
    profile,
    dailyTargets: targets[0] ? { ...targets[0], updatedAt: iso(targets[0].updatedAt) } : null,
    workouts: sessions.map(({ id, ...s }) => ({
      ...s,
      startedAt: iso(s.startedAt),
      endedAt: iso(s.endedAt),
      sets: setsBySession.get(id) ?? [],
    })),
    checkIns: checkins,
    food,
    water: water.map((w) => ({ ...w, at: iso(w.at) })),
    activities,
    steps,
    savedMeals: meals,
    favouriteFoods: favourites,
    chat: chat.map((m) => ({
      from: m.senderId === me.id ? 'you' : 'coach',
      body: m.body,
      at: iso(m.at),
    })),
  }
}
