import { z } from 'zod'
import { isoDate } from './validators'

// Calories burned by exercise, the MyFitnessPal way: added to the day's calorie target.
// Estimates use MET values (Compendium of Physical Activities): kcal = (MET - 1) x kg x hours.
// Only the part above resting counts, because resting is already in their daily target.

/** Activities logged by hand on Fuel ("Add activity"). */
export const ACTIVITY_KINDS = [
  'walk',
  'brisk_walk',
  'hike',
  'run',
  'cycle',
  'swim',
  'padel',
  'tennis',
  'football',
  'rugby',
  'netball',
  'cricket',
  'golf',
  'dance',
  'yoga',
  'gardening',
  'housework',
  'other_light',
  'other_hard',
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  walk: 'Walk',
  brisk_walk: 'Brisk walk',
  hike: 'Hike',
  run: 'Run',
  cycle: 'Cycle',
  swim: 'Swim',
  padel: 'Padel',
  tennis: 'Tennis',
  football: 'Football',
  rugby: 'Rugby',
  netball: 'Netball',
  cricket: 'Cricket',
  golf: 'Golf (walking)',
  dance: 'Dance',
  yoga: 'Yoga or stretching',
  gardening: 'Gardening',
  housework: 'Housework',
  other_light: 'Other, easy',
  other_hard: 'Other, hard',
}

export const ACTIVITY_METS: Record<ActivityKind, number> = {
  walk: 3.5,
  brisk_walk: 4.3,
  hike: 6,
  run: 9.8,
  cycle: 7,
  swim: 6,
  padel: 6,
  tennis: 7.3,
  football: 7,
  rugby: 8.3,
  netball: 6.5,
  cricket: 4.8,
  golf: 4.8,
  dance: 5,
  yoga: 2.5,
  gardening: 3.8,
  housework: 3,
  other_light: 3,
  other_hard: 7,
}

/** Resistance training, general (Compendium 02054): kept modest on purpose. */
export const STRENGTH_MET = 3.5
/** Everyday walking is already in their target: only steps above this count. */
export const STEP_BASELINE = 4000
/** A workout left open for hours counts at most this long. */
export const MAX_WORKOUT_MINUTES = 150
/** Minutes per set when a workout has no duration. */
const MINUTES_PER_SET = 2

export const MAX_ACTIVITY_MINUTES = 600
export const MAX_STEPS = 100_000

/** kcal above resting for a MET over some minutes. */
export function metKcal(met: number, weightKg: number, minutes: number): number {
  return Math.max(0, Math.round(((met - 1) * weightKg * minutes) / 60))
}

export function activityKcal(kind: ActivityKind, minutes: number, weightKg: number): number {
  return metKcal(ACTIVITY_METS[kind], weightKg, minutes)
}

/** Steps above the everyday baseline: about 0.5 kcal per kg per 1 000 steps. */
export function stepsKcal(steps: number, weightKg: number): number {
  return Math.max(0, Math.round(((steps - STEP_BASELINE) * weightKg * 0.5) / 1000))
}

/** A cardio exercise's MET from its name, and from its pace when distance and time are logged. */
export function cardioMet(name: string, speedKmh: number | null): number {
  const n = name.toLowerCase()
  const has = (...words: string[]) => words.some((w) => n.includes(w))
  if (has('run', 'jog', 'sprint')) return speedKmh ? runMet(speedKmh) : 9.8
  if (has('incline')) return 6
  if (has('walk')) return speedKmh ? walkMet(speedKmh) : 3.5
  if (has('cycl', 'bike', 'spin')) return 7
  if (has('row')) return 7
  if (has('ellip', 'cross trainer', 'cross-trainer')) return 5
  if (has('stair', 'step')) return 9
  if (has('rope', 'skip')) return 11
  if (has('swim')) return 6
  if (has('ski')) return 7
  if (speedKmh) return speedKmh >= 7.5 ? runMet(speedKmh) : walkMet(speedKmh)
  return 6
}

/** Running: about 1 MET per km/h (8 km/h ~ 8.3, 12 km/h ~ 11.8). */
const runMet = (kmh: number) => Math.min(16, Math.max(6, kmh * 0.98 + 0.5))
/** Walking: 3 km/h ~ 2.8, 5 km/h ~ 3.5, 6.5 km/h ~ 5. */
const walkMet = (kmh: number) => Math.min(6.5, Math.max(2.5, 1.25 + kmh * 0.55))

export interface BurnSet {
  category: 'strength' | 'cardio' | 'mobility'
  name: string
  isWarmup: boolean
  durationSeconds: number | null
  distanceM: number | null
}

/**
 * One finished workout: cardio sets by their own MET and time, the rest of the workout as
 * strength training. Without a duration, each set counts as two minutes.
 */
export function workoutKcal(
  sets: BurnSet[],
  durationSeconds: number | null,
  weightKg: number,
): number {
  let cardioMinutes = 0
  let cardioKcal = 0
  let otherSets = 0
  for (const s of sets) {
    if (s.category === 'cardio' && s.durationSeconds) {
      const minutes = s.durationSeconds / 60
      const speed = s.distanceM ? s.distanceM / 1000 / (s.durationSeconds / 3600) : null
      cardioMinutes += minutes
      cardioKcal += metKcal(cardioMet(s.name, speed), weightKg, minutes)
    } else otherSets += 1
  }
  const total =
    durationSeconds && durationSeconds > 0
      ? durationSeconds / 60
      : cardioMinutes + otherSets * MINUTES_PER_SET
  const capped = Math.min(total, MAX_WORKOUT_MINUTES)
  const strengthMinutes = otherSets > 0 ? Math.max(0, capped - cardioMinutes) : 0
  return Math.round(cardioKcal + metKcal(STRENGTH_MET, weightKg, strengthMinutes))
}

/** One activity logged by hand. */
export interface ActivityLog {
  id: number
  date: string
  kind: ActivityKind
  minutes: number
  kcal: number
}

/** A finished workout on that day, with its estimate. */
export interface WorkoutBurn {
  sessionId: number
  name: string
  minutes: number | null
  kcal: number
}

/** Everything burned on one day, added to that day's calorie target. */
export interface DayBurn {
  kcal: number
  workouts: WorkoutBurn[]
  activities: ActivityLog[]
  steps: number | null
  stepsKcal: number
  /** No weigh-in yet, so nothing could be estimated. */
  needsWeight: boolean
}

export const noBurn = (needsWeight = false): DayBurn => ({
  kcal: 0,
  workouts: [],
  activities: [],
  steps: null,
  stepsKcal: 0,
  needsWeight,
})

export const activityInput = z.object({
  clientUuid: z.string().uuid(),
  date: isoDate,
  kind: z.enum(ACTIVITY_KINDS),
  minutes: z.number().int().min(1).max(MAX_ACTIVITY_MINUTES),
})
export type ActivityInput = z.infer<typeof activityInput>

export const stepsInput = z.object({
  date: isoDate,
  steps: z.number().int().min(0).max(MAX_STEPS),
})
