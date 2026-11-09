import { addDays, daysBetween } from './dates'

export interface ProgramDaySlot {
  id: number
  weekNumber: number
  dayNumber: number
  workoutId: number | null
  checkinRequired?: boolean
}

export type CalendarDayState = 'done' | 'planned' | 'rest' | 'missed'

export interface CalendarDay {
  date: string
  weekNumber: number
  dayNumber: number
  programDayId: number | null
  workoutId: number | null
  checkinRequired: boolean
  state: CalendarDayState
  isToday: boolean
}

/** The calendar date of a program day. Day 1 of week 1 is the start date. */
export function programDayDate(startDate: string, weekNumber: number, dayNumber: number): string {
  if (weekNumber < 1 || dayNumber < 1 || dayNumber > 7) {
    throw new Error(`Invalid program day: week ${weekNumber}, day ${dayNumber}`)
  }
  return addDays(startDate, (weekNumber - 1) * 7 + (dayNumber - 1))
}

/** Which week and day of the program a date falls on, or null outside it. */
export function programPosition(
  startDate: string,
  durationWeeks: number,
  date: string,
): { weekNumber: number; dayNumber: number } | null {
  const offset = daysBetween(startDate, date)
  if (offset < 0 || offset >= durationWeeks * 7) return null
  return { weekNumber: Math.floor(offset / 7) + 1, dayNumber: (offset % 7) + 1 }
}

/**
 * Builds every day of an enrollment. Days the program doesn't list are rest days.
 * A workout day is done when a completed session points at it, missed when its
 * date has passed without one, otherwise planned.
 */
export function buildProgramCalendar(input: {
  startDate: string
  durationWeeks: number
  days: ProgramDaySlot[]
  completedProgramDayIds: Iterable<number>
  today: string
}): CalendarDay[] {
  const done = new Set(input.completedProgramDayIds)
  const byPosition = new Map<string, ProgramDaySlot>()
  for (const d of input.days) byPosition.set(`${d.weekNumber}:${d.dayNumber}`, d)

  const result: CalendarDay[] = []
  for (let week = 1; week <= input.durationWeeks; week++) {
    for (let day = 1; day <= 7; day++) {
      const slot = byPosition.get(`${week}:${day}`)
      const date = programDayDate(input.startDate, week, day)
      const workoutId = slot?.workoutId ?? null
      let state: CalendarDayState
      if (workoutId === null) state = 'rest'
      else if (slot && done.has(slot.id)) state = 'done'
      else if (date < input.today) state = 'missed'
      else state = 'planned'

      result.push({
        date,
        weekNumber: week,
        dayNumber: day,
        programDayId: slot?.id ?? null,
        workoutId,
        checkinRequired: slot?.checkinRequired ?? false,
        state,
        isToday: date === input.today,
      })
    }
  }
  return result
}
