// Programs one after another: a coach queues the next program, and on its start date it takes
// over from the current one. Everything logged on the old one stays in their history.
import { addDays } from './dates'

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
