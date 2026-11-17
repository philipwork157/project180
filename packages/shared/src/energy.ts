// Daily calories from body basics: resting burn (Mifflin-St Jeor), times how active someone is
// (maintenance), plus or minus what their weekly pace needs. Then protein, fat and carbs.
// It's an estimate to start from and adjust against real weigh-ins, not a medical number.
import { addDays } from './dates'
import type { ActivityLevel, Sex } from './enums'

/** Everyday life without workouts (exercise is added per day from what's logged). */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.3,
  active: 1.45,
  very_active: 1.6,
}

/** Paces the coach can pick, in kg a week (negative = lose). */
export const WEEKLY_PACES = [-0.75, -0.5, -0.25, 0, 0.25, 0.5] as const
export const MIN_WEEKLY_CHANGE_KG = -1
export const MAX_WEEKLY_CHANGE_KG = 1

/** Roughly what a kilogram of body weight is worth in calories. */
export const KCAL_PER_KG = 7700
/** Grams of protein per kg of reference weight. */
export const PROTEIN_G_PER_KG = 2
/** Share of calories from fat. */
export const FAT_SHARE = 0.25
/** A target this far from the weight it was worked out on suggests recalculating. */
export const RECALC_AFTER_KG = 2
/** Within this share of the calorie target counts as on target. */
export const ON_TARGET_SHARE = 0.05

export function paceLabel(kgPerWeek: number): string {
  if (kgPerWeek === 0) return 'Keep the same weight'
  return `${kgPerWeek < 0 ? 'Lose' : 'Gain'} ${Math.abs(kgPerWeek)} kg a week`
}

/** A sensible pace from where they are to where they want to be. */
export function suggestedPace(weightKg: number | null, goalWeightKg: number | null): number {
  if (weightKg === null || goalWeightKg === null) return 0
  if (goalWeightKg < weightKg - 1) return -0.5
  if (goalWeightKg > weightKg + 1) return 0.25
  return 0
}

/** Whole years from a birth date to a day (both YYYY-MM-DD). */
export function ageOn(birthDate: string, day: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number]
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0)
}

export interface EnergyInputs {
  birthDate: string | null
  sex: Sex | null
  heightCm: number | null
  weightKg: number | null
  activity: ActivityLevel | null
  /** kg a week; negative = lose. */
  weeklyChangeKg: number
  goalWeightKg: number | null
  /** Today in their time zone (YYYY-MM-DD). */
  today: string
}

/** What's missing to work it out, in the order a coach would fill it in. */
export type EnergyMissing = 'weight' | 'height' | 'birthDate' | 'sex' | 'activity'

export const ENERGY_MISSING_LABELS: Record<EnergyMissing, string> = {
  weight: 'a weigh-in',
  height: 'height',
  birthDate: 'birth date',
  sex: 'sex',
  activity: 'activity level',
}

export interface EnergyPlan {
  age: number
  /** Calories burned at rest. */
  bmr: number
  /** Calories a day that keep their weight the same. */
  maintenance: number
  /** Suggested daily target. */
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  /** The pace asked for more of a deficit than is safe, so the target was raised to the floor. */
  floored: boolean
  /** What the target actually changes per week at this target (kg; negative = lose). */
  weeklyChangeKg: number
  /** Their goal weight is the other way from the pace (e.g. lose with a higher goal). */
  goalMismatch: boolean
  /** When they'd reach the goal weight at this pace; null when there's none to reach. */
  goalDate: string | null
  weeksToGoal: number | null
}

export function energyMissing(i: EnergyInputs): EnergyMissing[] {
  const out: EnergyMissing[] = []
  if (i.weightKg === null) out.push('weight')
  if (i.heightCm === null) out.push('height')
  if (i.birthDate === null) out.push('birthDate')
  if (i.sex === null) out.push('sex')
  if (i.activity === null) out.push('activity')
  return out
}

const round10 = (n: number) => Math.round(n / 10) * 10

/** The lowest target ever suggested: their resting burn, and never under 1,200 / 1,500 kcal. */
export function kcalFloor(bmr: number, sex: Sex): number {
  return round10(Math.max(bmr, sex === 'female' ? 1200 : 1500))
}

/** Works out daily calories and macros; null when something it needs is missing. */
export function energyPlan(i: EnergyInputs): EnergyPlan | null {
  if (energyMissing(i).length > 0) return null
  const weight = i.weightKg as number
  const sex = i.sex as Sex
  const age = ageOn(i.birthDate as string, i.today)
  const bmr = Math.round(
    10 * weight + 6.25 * (i.heightCm as number) - 5 * age + (sex === 'male' ? 5 : -161),
  )
  const maintenance = round10(bmr * ACTIVITY_FACTORS[i.activity as ActivityLevel])
  const wanted = round10(maintenance + (i.weeklyChangeKg * KCAL_PER_KG) / 7)
  const floor = kcalFloor(bmr, sex)
  const floored = i.weeklyChangeKg < 0 && wanted < floor
  const kcal = floored ? floor : wanted
  const weeklyChangeKg = Math.round((((kcal - maintenance) * 7) / KCAL_PER_KG) * 100) / 100

  // Protein from the lighter of now and the goal when losing (closer to lean mass for big
  // bodies), else from now; never more than 35% of calories.
  const reference =
    i.weeklyChangeKg < 0 && i.goalWeightKg !== null ? Math.min(weight, i.goalWeightKg) : weight
  const proteinG = Math.round(Math.min(reference * PROTEIN_G_PER_KG, (kcal * 0.35) / 4, 400))
  const fatG = Math.max(40, Math.round((kcal * FAT_SHARE) / 9))
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4))

  const toGoal = i.goalWeightKg === null ? 0 : i.goalWeightKg - weight
  const goalMismatch =
    i.goalWeightKg !== null &&
    Math.abs(toGoal) > 0.5 &&
    i.weeklyChangeKg !== 0 &&
    Math.sign(toGoal) !== Math.sign(i.weeklyChangeKg)
  let weeksToGoal: number | null = null
  let goalDate: string | null = null
  if (!goalMismatch && Math.abs(toGoal) > 0.5 && weeklyChangeKg !== 0) {
    weeksToGoal = Math.ceil(Math.abs(toGoal / weeklyChangeKg))
    goalDate = addDays(i.today, Math.ceil(Math.abs(toGoal / weeklyChangeKg) * 7))
  }
  return {
    age,
    bmr,
    maintenance,
    kcal,
    proteinG,
    carbsG,
    fatG,
    floored,
    weeklyChangeKg,
    goalMismatch,
    goalDate,
    weeksToGoal,
  }
}

/** Their targets were worked out on a weight they've since moved well away from. */
export function needsRecalc(basisWeightKg: number | null, latestWeightKg: number | null): boolean {
  if (basisWeightKg === null || latestWeightKg === null) return false
  return Math.abs(latestWeightKg - basisWeightKg) >= RECALC_AFTER_KG
}

export type KcalStatus = 'left' | 'on_target' | 'over'

/** Under, within 5% of, or over the day's calorie target. */
export function kcalStatus(eaten: number, target: number): KcalStatus {
  if (eaten > target * (1 + ON_TARGET_SHARE)) return 'over'
  if (eaten >= target * (1 - ON_TARGET_SHARE)) return 'on_target'
  return 'left'
}
