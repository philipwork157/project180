// When to ask for a weigh-in, and what the app's notifications list shows.
import { addDays, daysBetween } from './dates'
import type { PlanDay } from './types'

/** A missed weigh-in day still asks for a few days, then waits for the next one. */
export const OVERDUE_DAYS = 3

export interface WeighInStatus {
  /** today = a weigh-in day; overdue = a recent one was missed. */
  kind: 'today' | 'overdue'
  /** The weigh-in day it's for. */
  date: string
  /** Weighed in today (or since the missed day). */
  done: boolean
  /** Today's weight, once logged. */
  weightKg: number | null
  /** The weigh-in before today, for "−0.4 kg since 5 Nov". */
  previous: { date: string; weightKg: number } | null
}

/**
 * Is a weigh-in due? Today when the program asks for one, or a weigh-in day in the last few
 * days that nothing was logged for (logging today counts for it). Null when nothing is due.
 */
export function weighInStatus(
  days: Pick<PlanDay, 'date' | 'checkinRequired'>[],
  today: string,
  bodyWeight: { date: string; weightKg: number }[],
): WeighInStatus | null {
  const sorted = [...bodyWeight].sort((a, b) => a.date.localeCompare(b.date))
  const todayLog = sorted.find((b) => b.date === today) ?? null
  const previous = sorted.filter((b) => b.date < today).at(-1) ?? null
  const base = { weightKg: todayLog?.weightKg ?? null, previous }
  if (days.some((d) => d.date === today && d.checkinRequired)) {
    return { kind: 'today', date: today, done: todayLog !== null, ...base }
  }
  const missed = days
    .filter(
      (d) =>
        d.checkinRequired &&
        d.date < today &&
        d.date >= addDays(today, -OVERDUE_DAYS) &&
        !sorted.some((b) => b.date >= d.date),
    )
    .at(-1)
  if (missed) return { kind: 'overdue', date: missed.date, done: false, ...base }
  // Caught up on a missed day today: say thanks instead of disappearing at once.
  const caughtUp = days
    .filter((d) => d.checkinRequired && d.date < today && d.date >= addDays(today, -OVERDUE_DAYS))
    .at(-1)
  if (caughtUp && todayLog && !sorted.some((b) => b.date >= caughtUp.date && b.date < today)) {
    return { kind: 'overdue', date: caughtUp.date, done: true, ...base }
  }
  return null
}

/** "−0.4 kg" / "+1.2 kg" / "same as" between two weights. */
export function weightChange(fromKg: number, toKg: number): string {
  const diff = Math.round((toKg - fromKg) * 10) / 10
  if (diff === 0) return 'No change'
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} kg`
}

export interface AppNotification {
  /** Stable per thing and day, so "seen" can be remembered. */
  id: string
  kind: 'weigh_in' | 'workout'
  title: string
  body: string
}

/**
 * The notifications list in the phone app: things to do today. Worked out from the plan, so
 * they appear and clear themselves (weigh in, and the weigh-in notification goes away).
 */
export function appNotifications(input: {
  today: string
  weighIn: WeighInStatus | null
  todayWorkout: Pick<PlanDay, 'date' | 'workoutName' | 'state'> | null
  workoutInProgress: boolean
}): AppNotification[] {
  const list: AppNotification[] = []
  const w = input.weighIn
  if (w && !w.done) {
    const late = daysBetween(w.date, input.today)
    list.push({
      id: `weigh-in:${w.date}`,
      kind: 'weigh_in',
      title: w.kind === 'today' ? 'Weigh-in today' : 'Weigh-in missed',
      body:
        w.kind === 'today'
          ? 'Log your weight so your coach can track your progress.'
          : `It was due ${late === 1 ? 'yesterday' : `${late} days ago`}. Log it now; it counts.`,
    })
  }
  const t = input.todayWorkout
  if (t && t.state === 'planned' && t.workoutName && !input.workoutInProgress) {
    list.push({
      id: `workout:${t.date}`,
      kind: 'workout',
      title: `Today: ${t.workoutName}`,
      body: 'Your workout for today is ready when you are.',
    })
  }
  return list
}
