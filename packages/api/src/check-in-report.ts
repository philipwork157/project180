// The check-in report: everything a client logged from the last check-in to this one, added up in
// SQL (a fixed number of queries for any period), with a verdict against their body goal.
import {
  bodyCheckins,
  checkInAnswers,
  type Db,
  foodEntries,
  nutritionTargets,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  addDays,
  type CheckInAnswers,
  type CheckInReport,
  checkInVerdict,
  daysBetween,
  energyPlan,
  MEAL_LABELS,
  type Meal,
  todayIn,
} from '@project180/shared'
import { and, asc, count, desc, eq, gte, lt, lte, sql } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import { loadBurn } from './burn'
import { loadProfile } from './profiles'
import { loadWaterSummary } from './routes/water'

const MEASUREMENTS = [
  ['waistCm', 'Waist'],
  ['hipsCm', 'Hips'],
  ['chestCm', 'Chest'],
  ['armCm', 'Arm'],
  ['thighCm', 'Thigh'],
] as const

const avg = (sum: number, n: number) => (n > 0 ? Math.round((sum / n) * 10) / 10 : null)
const round1 = (n: number) => Math.round(n * 10) / 10

export async function buildCheckInReport(
  db: Db,
  person: { id: number; timezone: string },
  from: string,
  to: string,
  checkInId: number | null,
): Promise<CheckInReport> {
  const fromTime = new Date(`${addDays(from, -1)}T00:00:00Z`)
  const toTime = new Date(`${addDays(to, 2)}T00:00:00Z`)
  const inRange = (col: SQLiteColumn) => and(gte(col, from), lte(col, to))
  const [
    perDay,
    perMeal,
    topFoods,
    [targets],
    weighIns,
    [before],
    water,
    burn,
    sessions,
    profile,
    [answers],
  ] = await Promise.all([
    db
      .select({
        date: foodEntries.date,
        kcal: sql<number>`sum(${foodEntries.kcal})`,
        proteinG: sql<number>`sum(${foodEntries.proteinG})`,
        carbsG: sql<number>`coalesce(sum(${foodEntries.carbsG}), 0)`,
        fatG: sql<number>`coalesce(sum(${foodEntries.fatG}), 0)`,
        fibreG: sql<number>`coalesce(sum(${foodEntries.fibreG}), 0)`,
      })
      .from(foodEntries)
      .where(and(eq(foodEntries.userId, person.id), inRange(foodEntries.date)))
      .groupBy(foodEntries.date)
      .orderBy(asc(foodEntries.date)),
    db
      .select({
        meal: foodEntries.meal,
        kcal: sql<number>`sum(${foodEntries.kcal})`,
        days: sql<number>`count(distinct ${foodEntries.date})`,
      })
      .from(foodEntries)
      .where(and(eq(foodEntries.userId, person.id), inRange(foodEntries.date)))
      .groupBy(foodEntries.meal),
    db
      .select({ name: sql<string>`min(${foodEntries.name})`, times: count() })
      .from(foodEntries)
      .where(and(eq(foodEntries.userId, person.id), inRange(foodEntries.date)))
      .groupBy(sql`lower(${foodEntries.name})`)
      .orderBy(desc(count()))
      .limit(5),
    db
      .select({ kcal: nutritionTargets.kcal, proteinG: nutritionTargets.proteinG })
      .from(nutritionTargets)
      .where(eq(nutritionTargets.userId, person.id)),
    db
      .select()
      .from(bodyCheckins)
      .where(and(eq(bodyCheckins.userId, person.id), inRange(bodyCheckins.date)))
      .orderBy(asc(bodyCheckins.date)),
    // The last weigh-in before the period: where it started.
    db
      .select({ date: bodyCheckins.date, weightKg: bodyCheckins.weightKg })
      .from(bodyCheckins)
      .where(
        and(
          eq(bodyCheckins.userId, person.id),
          lt(bodyCheckins.date, from),
          sql`${bodyCheckins.weightKg} is not null`,
        ),
      )
      .orderBy(desc(bodyCheckins.date))
      .limit(1),
    loadWaterSummary(db, person.id, from, to),
    loadBurn(db, person, from, to),
    db
      .select({
        name: workouts.name,
        startedAt: workoutSessions.startedAt,
        durationSeconds: workoutSessions.durationSeconds,
        feeling: workoutSessions.feeling,
      })
      .from(workoutSessions)
      .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
      .where(
        and(
          eq(workoutSessions.userId, person.id),
          eq(workoutSessions.status, 'completed'),
          gte(workoutSessions.startedAt, fromTime),
          lte(workoutSessions.startedAt, toTime),
        ),
      )
      .orderBy(asc(workoutSessions.startedAt)),
    loadProfile(db, person.id),
    checkInId === null
      ? Promise.resolve([])
      : db.select().from(checkInAnswers).where(eq(checkInAnswers.checkInId, checkInId)),
  ])

  const days = daysBetween(from, to) + 1

  // Food
  const logged = perDay.map((d) => ({
    date: d.date,
    kcal: Number(d.kcal),
    proteinG: Number(d.proteinG),
    carbsG: Number(d.carbsG),
    fatG: Number(d.fatG),
    fibreG: Number(d.fibreG),
  }))
  const sum = (key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fibreG') =>
    logged.reduce((t, d) => t + d[key], 0)
  const n = logged.length
  const targetKcal = targets?.kcal ?? null
  const targetProteinG = targets?.proteinG ?? null
  const daysOnTarget =
    targetKcal === null
      ? 0
      : logged.filter((d) => Math.abs(d.kcal - targetKcal) <= targetKcal * 0.1).length
  const proteinDaysHit =
    targetProteinG === null ? 0 : logged.filter((d) => d.proteinG >= targetProteinG * 0.9).length

  // Weight and body
  const points = weighIns
    .filter((w) => w.weightKg !== null)
    .map((w) => ({ date: w.date, weightKg: w.weightKg as number }))
  const startKg = before?.weightKg ?? points[0]?.weightKg ?? null
  const endKg = points.at(-1)?.weightKg ?? null
  const changeKg =
    startKg !== null && endKg !== null && (before || points.length > 1)
      ? round1(endKg - startKg)
      : null
  const measurements = MEASUREMENTS.flatMap(([key, label]) => {
    const values = weighIns.filter((w) => w[key] !== null)
    const first = values[0]?.[key]
    const last = values.at(-1)?.[key]
    return values.length > 1 && first != null && last != null
      ? [{ key, label, startCm: first, endCm: last }]
      : []
  })

  // Maintenance: what keeps their weight, from their profile and latest weight.
  const plan = energyPlan({
    birthDate: profile.birthDate,
    sex: profile.sex,
    heightCm: profile.heightCm,
    weightKg: endKg ?? profile.latestWeightKg,
    activity: profile.activityLevel,
    weeklyChangeKg: 0,
    goalWeightKg: null,
    today: to,
  })
  const maintenance = plan?.maintenance ?? null

  // Water
  const waterDays = water.days.filter((d) => d.ml > 0)
  const waterReached =
    water.goalMl === null ? 0 : waterDays.filter((d) => d.ml >= (water.goalMl as number)).length

  // Movement
  const burnDays = [...burn.values()]
  const burned = burnDays.reduce((t, d) => t + d.kcal, 0)
  const stepDays = burnDays.filter((d) => d.steps !== null)
  const steps = stepDays.reduce((t, d) => t + (d.steps ?? 0), 0)
  const activities = burnDays.reduce((t, d) => t + d.activities.length, 0)
  const avgBurned = Math.round(burned / days)

  // Training (their local days)
  const trained = sessions
    .map((s) => ({
      startedAt: s.startedAt.toISOString(),
      date: todayIn(person.timezone, s.startedAt),
      name: s.name ?? 'Workout',
      minutes: s.durationSeconds ? Math.round(s.durationSeconds / 60) : null,
      feeling: s.feeling,
    }))
    .filter((s) => s.date >= from && s.date <= to)

  const verdict = checkInVerdict({
    goal: profile.bodyGoal,
    daysLogged: n,
    days,
    avgKcal: avg(sum('kcal'), n),
    maintenance,
    avgBurned,
    weightChangeKg: changeKg,
    proteinDaysHit,
    workoutsDone: trained.length,
  })

  const answer: CheckInAnswers | null = answers
    ? {
        week: answers.week,
        sleep: answers.sleep,
        stress: answers.stress,
        hunger: answers.hunger,
        wins: answers.wins,
        struggles: answers.struggles,
        notes: answers.notes,
        updatedAt: answers.updatedAt.toISOString(),
      }
    : null

  const flags: string[] = []
  const missing = days - n
  if (missing >= 2) flags.push(`${missing} of ${days} days with no food logged`)
  if (targetProteinG !== null && n > 0 && proteinDaysHit < Math.ceil(n * 0.6))
    flags.push(`Protein under target on ${n - proteinDaysHit} of ${n} logged days`)
  if (points.length === 0) flags.push('No weigh-in this period')
  if (trained.length === 0) flags.push('No workouts done')
  if (water.goalMl !== null && waterDays.length > 0 && waterReached < Math.ceil(days / 2))
    flags.push(`Water goal reached on ${waterReached} of ${days} days`)
  if (answer && answer.sleep <= 2) flags.push('Says they’re sleeping badly')
  if (answer && answer.stress >= 4) flags.push('Says they’re very stressed')
  if (answer && answer.hunger >= 4) flags.push('Says they’re very hungry')

  return {
    from,
    to,
    days,
    goal: profile.bodyGoal,
    verdict,
    flags,
    weight: { startKg, endKg, changeKg, points, measurements },
    food: {
      daysLogged: n,
      avgKcal: avg(sum('kcal'), n) === null ? null : Math.round(sum('kcal') / n),
      avgProteinG: avg(sum('proteinG'), n),
      avgCarbsG: avg(sum('carbsG'), n),
      avgFatG: avg(sum('fatG'), n),
      avgFibreG: avg(sum('fibreG'), n),
      targetKcal,
      targetProteinG,
      maintenance,
      daysOnTarget,
      proteinDaysHit,
      byMeal: perMeal
        .map((m) => ({
          meal: MEAL_LABELS[m.meal as Meal] ?? m.meal,
          avgKcal: Math.round(Number(m.kcal) / Math.max(1, Number(m.days))),
          days: Number(m.days),
        }))
        .sort((a, b) => b.avgKcal - a.avgKcal),
      topFoods: topFoods.map((f) => ({ name: f.name, times: f.times })),
      perDay: logged.map((d) => ({
        date: d.date,
        kcal: Math.round(d.kcal),
        proteinG: round1(d.proteinG),
      })),
    },
    water: {
      goalMl: water.goalMl,
      avgMl:
        waterDays.length === 0
          ? null
          : Math.round(waterDays.reduce((t, d) => t + d.ml, 0) / waterDays.length),
      daysLogged: waterDays.length,
      daysReached: waterReached,
    },
    movement: {
      avgSteps: stepDays.length === 0 ? null : Math.round(steps / stepDays.length),
      activities,
      avgBurned,
    },
    training: { done: trained.length, workouts: trained },
    answers: answer,
  }
}
