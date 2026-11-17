// Programs one after another: a coach queues the next program, and on its start date it takes
// over from the current one. Everything logged on the old one stays in their history.
import { z } from 'zod'
import { addDays } from './dates'
import { isoDate } from './validators'

interface Dated {
  startDate: string
  durationWeeks: number
}

/** A calendar day for people: "Mon 23 Nov". */
export function formatDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(new Date(`${day}T00:00:00Z`))
    .replace(',', '')
}

/** The last day of a program that starts on `startDate` (inclusive). */
export function programEndDate(startDate: string, durationWeeks: number): string {
  return addDays(startDate, Math.max(durationWeeks, 1) * 7 - 1)
}

/**
 * When the next program should start by default: the day after the current program and anything
 * already queued ends. Null when nothing runs past today (assign from a date of your choice).
 */
export function nextProgramStart(today: string, programs: Dated[]): string | null {
  let last: string | null = null
  for (const p of programs) {
    const end = programEndDate(p.startDate, p.durationWeeks)
    if (last === null || end > last) last = end
  }
  if (last === null || last < today) return null
  return addDays(last, 1)
}

/** True when a program starting on `startDate` waits in the queue instead of replacing the current one. */
export function queuesBehind(
  current: { startDate: string } | null | undefined,
  startDate: string,
  today: string,
): boolean {
  return Boolean(current) && startDate > today && startDate > (current?.startDate ?? '')
}

export interface ScheduleRow {
  id: number
  startDate: string
}

/**
 * What changes for one person today. `scheduled` are their queued programs.
 * - The latest queued program whose start date has come becomes current; the current one and any
 *   queued ones it skipped past are finished (their history stays).
 * - With no current program at all, the first queued one becomes current straight away (its
 *   calendar shows "starts on …"), the same as assigning a program from a future date.
 */
export function dueToStart(
  active: ScheduleRow | null,
  scheduled: ScheduleRow[],
  today: string,
): { activate: number | null; finish: number[] } {
  const queue = [...scheduled].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.id - b.id)
  const due = queue.filter((s) => s.startDate <= today)
  const next = due.at(-1)
  if (next) {
    const skipped = due.slice(0, -1).map((s) => s.id)
    return { activate: next.id, finish: active ? [active.id, ...skipped] : skipped }
  }
  if (!active && queue[0]) return { activate: queue[0].id, finish: [] }
  return { activate: null, finish: [] }
}

/**
 * Restarting a past program (admin, Past programs):
 * - continue: pick up at the week they stopped; everything logged stays and keeps its ticks.
 * - again: week 1 starts on the new date; old workouts stay in history and totals, but no longer
 *   tick off the new calendar.
 * - fresh: everything logged on it is deleted and week 1 starts on the new date.
 */
export const RESTART_MODES = ['continue', 'again', 'fresh'] as const
export type RestartMode = (typeof RESTART_MODES)[number]

export const restartProgramInput = z.object({
  startDate: isoDate,
  mode: z.enum(RESTART_MODES),
})
export type RestartProgramInput = z.infer<typeof restartProgramInput>

interface GridDay {
  id: number
  weekNumber: number
  workoutId: number | null
}

/**
 * The week a program picks up at: the week of the first workout day not done yet.
 * Null when every workout day is done (nothing to pick up; start it again instead).
 */
export function resumeWeek(days: GridDay[], doneDayIds: ReadonlySet<number>): number | null {
  let week: number | null = null
  for (const d of days) {
    if (d.workoutId === null || doneDayIds.has(d.id)) continue
    if (week === null || d.weekNumber < week) week = d.weekNumber
  }
  return week
}

/** The start date that puts week `week` on `day` (week 1 → the same day). */
export function startDateForWeek(day: string, week: number): string {
  return addDays(day, -(Math.max(week, 1) - 1) * 7)
}
