import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, isIsoDay, todayIn, weekdayIndex } from './dates'
import { formatDuration, formatWeight } from './format'

describe('dates', () => {
  it('validates calendar days', () => {
    expect(isIsoDay('2026-02-28')).toBe(true)
    expect(isIsoDay('2026-02-30')).toBe(false)
    expect(isIsoDay('26-2-1')).toBe(false)
  })

  it('adds and counts days', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(daysBetween('2026-11-09', '2026-11-16')).toBe(7)
  })

  it("finds today's date in the user's time zone", () => {
    // 23:30 UTC is already the next day in Johannesburg (UTC+2).
    const now = new Date('2026-11-08T23:30:00Z')
    expect(todayIn('Africa/Johannesburg', now)).toBe('2026-11-09')
    expect(todayIn('UTC', now)).toBe('2026-11-08')
  })

  it('numbers weekdays from Monday', () => {
    expect(weekdayIndex('2026-11-09')).toBe(0)
    expect(weekdayIndex('2026-11-15')).toBe(6)
  })
})

describe('format', () => {
  it('formats weights', () => {
    expect(formatWeight(42.5)).toBe('42.5')
    expect(formatWeight(40)).toBe('40')
    expect(formatWeight(20, 'lb')).toBe('44.1')
  })

  it('formats durations', () => {
    expect(formatDuration(2892)).toBe('48:12')
    expect(formatDuration(3725)).toBe('1:02:05')
  })
})

describe('todayIn with a bad time zone', () => {
  it('falls back to Johannesburg instead of throwing', () => {
    const at = new Date('2026-11-09T23:30:00Z')
    expect(todayIn('Not/AZone', at)).toBe(todayIn('Africa/Johannesburg', at))
  })
})
