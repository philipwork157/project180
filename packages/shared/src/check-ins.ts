// Check-ins: a date a client and their coach look at how the last period went. The coach sets the
// date and how often; the client is reminded and answers a few questions; the report adds up
// everything logged since the last check-in and says whether it fits the client's body goal.
import { z } from 'zod'
import { addDays, daysBetween } from './dates'
import { BODY_GOALS, type BodyGoal } from './enums'
import { isoDate } from './validators'

/** How often check-ins repeat: weeks, or null for just this once. */
export const CHECK_IN_REPEATS = [1, 2, 4] as const
export const DEFAULT_CHECK_IN_WEEKS = 2
/** With no earlier check-in, the report looks back this many days. */
export const CHECK_IN_FIRST_PERIOD_DAYS = 14
/** The longest period one report covers. */
export const CHECK_IN_MAX_DAYS = 92

export interface CheckIn {
  id: number
  dueDate: string
  repeatWeeks: number | null
  status: 'scheduled' | 'done' | 'cancelled'
  coachNotes: string | null
  coachName: string | null
  doneAt: string | null
  answers: CheckInAnswers | null
}

export interface CheckInAnswers {
  week: number
  sleep: number
  stress: number
  hunger: number
  wins: string | null
  struggles: string | null
  notes: string | null
  updatedAt: string
}

/** A client's check-ins, for their coach: the next one and the last ones done. */
export interface CheckInList {
  next: CheckIn | null
  past: CheckIn[]
}

/** The client's next check-in (app). */
export interface MyCheckIn {
  id: number
  dueDate: string
  coachName: string | null
  answers: CheckInAnswers | null
}

const repeatWeeks = z
  .number()
  .int()
  .refine((n) => (CHECK_IN_REPEATS as readonly number[]).includes(n), 'Every 1, 2 or 4 weeks')
  .nullable()

/** The coach sets (or moves) the next check-in. */
export const scheduleCheckInInput = z.object({ dueDate: isoDate, repeatWeeks })

export const updateCheckInInput = z.object({
  dueDate: isoDate.optional(),
  repeatWeeks: repeatWeeks.optional(),
  coachNotes: z.string().trim().max(4000).nullable().optional(),
})

/** Marking a check-in done, with the coach's notes. */
export const completeCheckInInput = z.object({
  coachNotes: z.string().trim().max(4000).nullable().optional(),
})

const rating = z.number().int().min(1).max(5)
const answerText = z
  .string()
  .trim()
  .max(1000)
  .nullish()
  .transform((v) => v || null)

/** The client's answers before a check-in. */
export const checkInAnswersInput = z.object({
  week: rating,
  sleep: rating,
  stress: rating,
  hunger: rating,
  wins: answerText,
  struggles: answerText,
  notes: answerText,
})
export type CheckInAnswersInput = z.input<typeof checkInAnswersInput>

/** The client form's questions, in order. 1 = bad, 5 = great (stress and hunger: 1 = low). */
export const CHECK_IN_QUESTIONS = {
  week: { label: 'How did the period go overall?', low: 'Hard', high: 'Great' },
  sleep: { label: 'How did you sleep?', low: 'Badly', high: 'Very well' },
  stress: { label: 'How stressed have you been?', low: 'Calm', high: 'Very stressed' },
  hunger: { label: 'How hungry have you been?', low: 'Not at all', high: 'Very hungry' },
} as const

/** The next check-in after one is done. */
export function nextCheckInDate(dueDate: string, repeat: number | null, today: string) {
  if (!repeat) return null
  let next = addDays(dueDate, repeat * 7)
  // Done late: the next one is still in the future.
  while (next <= today) next = addDays(next, repeat * 7)
  return next
}

/** The days a report covers: from the day after the last check-in to the due date (or today). */
export function checkInPeriod(input: {
  lastDone: string | null
  dueDate: string | null
  today: string
}): { from: string; to: string } {
  const to = input.dueDate && input.dueDate < input.today ? input.dueDate : input.today
  let from = input.lastDone
    ? addDays(input.lastDone, 1)
    : addDays(to, -(CHECK_IN_FIRST_PERIOD_DAYS - 1))
  if (from > to) from = to
  if (daysBetween(from, to) > CHECK_IN_MAX_DAYS - 1) from = addDays(to, -(CHECK_IN_MAX_DAYS - 1))
  return { from, to }
}

export type VerdictStatus = 'on_track' | 'off_track' | 'unclear'

export interface CheckInVerdict {
  status: VerdictStatus
  headline: string
  detail: string
}

/** Within this many kcal a day of maintenance counts as "around maintenance". */
export const MAINTENANCE_BAND = 150

/**
 * Does what they did fit their body goal? Uses the average daily balance (eaten minus
 * maintenance, plus what they burned), the weight change and, for muscle and strength, protein
 * and training. Plain words for the coach; "unclear" when there's too little to go on.
 */
export function checkInVerdict(input: {
  goal: BodyGoal | null
  daysLogged: number
  days: number
  /** Average kcal eaten on logged days. */
  avgKcal: number | null
  maintenance: number | null
  /** Average kcal burned on top (activities, steps above the baseline, workouts). */
  avgBurned: number
  weightChangeKg: number | null
  proteinDaysHit: number
  workoutsDone: number
}): CheckInVerdict {
  const { goal } = input
  if (!goal)
    return {
      status: 'unclear',
      headline: 'No body goal set',
      detail: 'Pick a body goal for this client to see whether the period fits it.',
    }
  if (input.daysLogged < Math.max(2, Math.ceil(input.days / 3)) || input.avgKcal === null)
    return {
      status: 'unclear',
      headline: 'Not enough food logged',
      detail: `Food was logged on ${input.daysLogged} of ${input.days} days: too little to judge the calories.`,
    }
  if (input.maintenance === null)
    return {
      status: 'unclear',
      headline: 'Maintenance unknown',
      detail:
        'Add height, birth date, sex, activity level and a weigh-in to work out their maintenance calories.',
    }
  const balance = Math.round(input.avgKcal - input.maintenance - input.avgBurned)
  const weekly = Math.round(((balance * 7) / 7700) * 100) / 100
  const words =
    balance < -MAINTENANCE_BAND
      ? `about ${Math.abs(balance)} kcal a day under maintenance`
      : balance > MAINTENANCE_BAND
        ? `about ${balance} kcal a day over maintenance`
        : 'around maintenance'
  const expected = `${words} (expected ${weekly > 0 ? '+' : ''}${weekly} kg a week)`
  const weight =
    input.weightChangeKg === null
      ? 'No weigh-ins to compare.'
      : `Weight ${input.weightChangeKg > 0 ? 'up' : input.weightChangeKg < 0 ? 'down' : 'unchanged'}${input.weightChangeKg === 0 ? '' : ` ${Math.abs(input.weightChangeKg)} kg`}.`
  const protein = `Protein hit on ${input.proteinDaysHit} of ${input.daysLogged} logged days.`
  const training = `${input.workoutsDone} workout${input.workoutsDone === 1 ? '' : 's'} done.`
  const deficit = balance < -MAINTENANCE_BAND
  const surplus = balance > MAINTENANCE_BAND
  const around = !deficit && !surplus
  const proteinOk = input.proteinDaysHit >= Math.ceil(input.daysLogged * 0.6)
  const ok = (cond: boolean, yes: string, no: string): CheckInVerdict => ({
    status: cond ? 'on_track' : 'off_track',
    headline: cond ? yes : no,
    detail: `Eating ${expected}. ${weight}`,
  })
  switch (goal) {
    case 'lose_fat':
      return ok(deficit, 'In a deficit: on track to lose fat', 'Not in a deficit')
    case 'maintain':
      return ok(
        around,
        'Around maintenance: on track',
        deficit ? 'Eating under maintenance' : 'Eating over maintenance',
      )
    case 'gain_weight':
      return ok(surplus, 'In a surplus: on track to gain', 'Not in a surplus')
    case 'build_muscle': {
      const fits = !deficit && proteinOk && input.workoutsDone > 0
      return {
        status: fits ? 'on_track' : 'off_track',
        headline: fits
          ? 'Fuelled to build muscle'
          : deficit
            ? 'In a deficit: hard to build muscle'
            : !proteinOk
              ? 'Protein too low to build muscle'
              : 'No workouts done',
        detail: `Eating ${expected}. ${protein} ${training} ${weight}`,
      }
    }
    case 'get_stronger': {
      const fits = input.workoutsDone > 0 && proteinOk && balance > -500
      return {
        status: fits ? 'on_track' : 'off_track',
        headline: fits
          ? 'Training and fuel support getting stronger'
          : input.workoutsDone === 0
            ? 'No workouts done'
            : !proteinOk
              ? 'Protein too low'
              : 'Deficit too big for strength',
        detail: `${training} ${protein} Eating ${expected}.`,
      }
    }
    case 'recomp': {
      const fits =
        balance <= MAINTENANCE_BAND && balance > -500 && proteinOk && input.workoutsDone > 0
      return {
        status: fits ? 'on_track' : 'off_track',
        headline: fits
          ? 'On track for a recomp'
          : !proteinOk
            ? 'Protein too low for a recomp'
            : input.workoutsDone === 0
              ? 'No workouts done'
              : surplus
                ? 'Eating over maintenance'
                : 'Deficit too big for a recomp',
        detail: `Eating ${expected}. ${protein} ${training} ${weight}`,
      }
    }
  }
}

export interface CheckInReport {
  from: string
  to: string
  days: number
  goal: BodyGoal | null
  verdict: CheckInVerdict
  /** Short things to look at first ("3 days with no food logged"). */
  flags: string[]
  weight: {
    startKg: number | null
    endKg: number | null
    changeKg: number | null
    points: Array<{ date: string; weightKg: number }>
    /** Measurement changes over the period (cm), where both ends were logged. */
    measurements: Array<{ key: string; label: string; startCm: number; endCm: number }>
  }
  food: {
    daysLogged: number
    avgKcal: number | null
    avgProteinG: number | null
    avgCarbsG: number | null
    avgFatG: number | null
    avgFibreG: number | null
    targetKcal: number | null
    targetProteinG: number | null
    maintenance: number | null
    daysOnTarget: number
    proteinDaysHit: number
    byMeal: Array<{ meal: string; avgKcal: number; days: number }>
    topFoods: Array<{ name: string; times: number }>
    perDay: Array<{ date: string; kcal: number; proteinG: number }>
  }
  water: { goalMl: number | null; avgMl: number | null; daysLogged: number; daysReached: number }
  movement: { avgSteps: number | null; activities: number; avgBurned: number }
  training: {
    done: number
    workouts: Array<{
      startedAt: string
      date: string
      name: string
      minutes: number | null
      feeling: number | null
    }>
  }
  /** The client's own answers, when this period ends in a check-in they answered. */
  answers: CheckInAnswers | null
}

export const isBodyGoal = (v: unknown): v is BodyGoal =>
  typeof v === 'string' && (BODY_GOALS as readonly string[]).includes(v)
