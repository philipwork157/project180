import { describe, expect, it } from 'vitest'
import { buildProgramCalendar, programDayDate, programPosition } from './calendar'

describe('programDayDate', () => {
  it('puts week 1 day 1 on the start date', () => {
    expect(programDayDate('2026-11-09', 1, 1)).toBe('2026-11-09')
  })

  it('counts days across weeks and month ends', () => {
    expect(programDayDate('2026-11-09', 1, 7)).toBe('2026-11-15')
    expect(programDayDate('2026-11-09', 2, 1)).toBe('2026-11-16')
    expect(programDayDate('2026-11-09', 4, 7)).toBe('2026-12-06')
  })

  it('rejects impossible days', () => {
    expect(() => programDayDate('2026-11-09', 0, 1)).toThrow()
    expect(() => programDayDate('2026-11-09', 1, 8)).toThrow()
  })
})

describe('programPosition', () => {
  it('finds the week and day of a date', () => {
    expect(programPosition('2026-11-09', 4, '2026-11-18')).toEqual({ weekNumber: 2, dayNumber: 3 })
  })

  it('is null before the start or after the end', () => {
    expect(programPosition('2026-11-09', 4, '2026-11-08')).toBeNull()
    expect(programPosition('2026-11-09', 4, '2026-12-07')).toBeNull()
  })
})

describe('buildProgramCalendar', () => {
  const days = [
    { id: 1, weekNumber: 1, dayNumber: 1, workoutId: 10 },
    { id: 2, weekNumber: 1, dayNumber: 3, workoutId: 11, checkinRequired: true },
    { id: 3, weekNumber: 1, dayNumber: 5, workoutId: 10 },
    { id: 4, weekNumber: 1, dayNumber: 6, workoutId: null },
  ]

  const calendar = buildProgramCalendar({
    startDate: '2026-11-09',
    durationWeeks: 1,
    days,
    completedProgramDayIds: [1],
    today: '2026-11-12',
  })

  it('has seven days per week', () => {
    expect(calendar).toHaveLength(7)
  })

  it('marks done, missed, planned and rest days', () => {
    expect(calendar.map((d) => d.state)).toEqual([
      'done', // Mon, completed
      'rest', // Tue, not in the program
      'missed', // Wed, passed without a session
      'rest', // Thu
      'planned', // Fri, still ahead
      'rest', // Sat, listed as rest
      'rest', // Sun
    ])
  })

  it('flags today and check-in days', () => {
    expect(calendar.find((d) => d.isToday)?.date).toBe('2026-11-12')
    expect(calendar[2]?.checkinRequired).toBe(true)
  })
})
