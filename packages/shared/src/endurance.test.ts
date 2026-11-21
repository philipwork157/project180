import { describe, expect, it } from 'vitest'
import {
  enduranceSummary,
  enduranceTargets,
  estimateMaxHr,
  formatPacePerKm,
  formatRaceTime,
  hrZoneBpm,
  hrZoneLabel,
  isTimedRace,
  parseRaceTime,
  racePacePerKm,
  raceSummary,
  wantsEnduranceNumbers,
  wattsAt,
} from './endurance'

describe('hrZoneBpm', () => {
  it('uses percent of max without a resting heart rate', () => {
    expect(hrZoneBpm(2, 190)).toEqual({ low: 114, high: 133 })
  })
  it('uses heart-rate reserve with a resting heart rate', () => {
    // 50 + (190 - 50) × 0.6 = 134, × 0.7 = 148
    expect(hrZoneBpm(2, 190, 50)).toEqual({ low: 134, high: 148 })
    expect(hrZoneLabel(2, 190, 50)).toBe('134–148 bpm')
  })
  it('ignores a resting heart rate at or above max', () => {
    expect(hrZoneBpm(5, 180, 200)).toEqual({ low: 162, high: 180 })
  })
  it('is null without a zone or max', () => {
    expect(hrZoneBpm(null, 190)).toBeNull()
    expect(hrZoneBpm(2, null)).toBeNull()
    expect(hrZoneBpm(7, 190)).toBeNull()
    expect(hrZoneLabel(2, null)).toBeNull()
  })
})

describe('estimateMaxHr and wattsAt', () => {
  it('estimates from age', () => {
    expect(estimateMaxHr(40)).toBe(180)
    expect(estimateMaxHr(null)).toBeNull()
    expect(estimateMaxHr(5)).toBeNull()
  })
  it('works out watts from FTP', () => {
    expect(wattsAt(250, 90)).toBe(225)
    expect(wattsAt(null, 90)).toBeNull()
    expect(wattsAt(250, 0)).toBeNull()
  })
})

describe('race times', () => {
  it('parses h:mm:ss, mm:ss and plain minutes', () => {
    expect(parseRaceTime('1:45:00')).toBe(6300)
    expect(parseRaceTime('25:30')).toBe(1530)
    expect(parseRaceTime('52')).toBe(3120)
    expect(parseRaceTime(' 3:59:59 ')).toBe(14399)
  })
  it('refuses half-typed or impossible times', () => {
    expect(parseRaceTime('')).toBeNull()
    expect(parseRaceTime('1:')).toBeNull()
    expect(parseRaceTime('1:75:00')).toBeNull()
    expect(parseRaceTime('25:61')).toBeNull()
    expect(parseRaceTime('abc')).toBeNull()
    expect(parseRaceTime('0')).toBeNull()
    expect(parseRaceTime('1:2:3:4')).toBeNull()
  })
  it('formats back', () => {
    expect(formatRaceTime(6300)).toBe('1:45:00')
    expect(formatRaceTime(1530)).toBe('25:30')
    expect(formatRaceTime(null)).toBe('')
    expect(parseRaceTime(formatRaceTime(14399))).toBe(14399)
  })
  it('gives the pace a goal time needs', () => {
    expect(racePacePerKm('10k', 3000)).toBe(300)
    expect(formatPacePerKm(racePacePerKm('marathon', 4 * 3600))).toBe('5:41 /km')
    expect(racePacePerKm('ironman', 36000)).toBeNull()
    expect(racePacePerKm(null, 3000)).toBeNull()
    expect(formatPacePerKm(null)).toBe('')
  })
  it('knows which races are timed', () => {
    expect(isTimedRace('marathon')).toBe(true)
    expect(isTimedRace('hyrox')).toBe(true)
    expect(isTimedRace('bodybuilding_show')).toBe(false)
    expect(isTimedRace('powerlifting_meet')).toBe(false)
    expect(isTimedRace(null)).toBe(false)
  })
})

describe('wantsEnduranceNumbers', () => {
  it('is true for endurance focus areas only', () => {
    expect(wantsEnduranceNumbers(['bodybuilding', null])).toBe(false)
    expect(wantsEnduranceNumbers(['build_muscle', 'cycling'])).toBe(true)
    expect(wantsEnduranceNumbers(['hyrox'])).toBe(true)
    expect(wantsEnduranceNumbers([])).toBe(false)
  })
})

describe('summaries', () => {
  it('describes a race goal', () => {
    expect(
      raceSummary({
        raceKind: 'half_marathon',
        targetEvent: 'Two Oceans',
        goalTimeSeconds: 6300,
        bestTimeSeconds: 6730,
      }),
    ).toBe('Half marathon · Two Oceans · goal 1:45:00 · PB 1:52:10')
  })
  it('leaves times off untimed competitions and "other"', () => {
    expect(
      raceSummary({
        raceKind: 'bodybuilding_show',
        targetEvent: null,
        goalTimeSeconds: 100,
        bestTimeSeconds: null,
      }),
    ).toBe('Bodybuilding show')
    expect(
      raceSummary({
        raceKind: 'other',
        targetEvent: 'Midmar Mile',
        goalTimeSeconds: null,
        bestTimeSeconds: null,
      }),
    ).toBe('Midmar Mile')
    expect(
      raceSummary({
        raceKind: null,
        targetEvent: ' ',
        goalTimeSeconds: null,
        bestTimeSeconds: null,
      }),
    ).toBeNull()
  })
  it('describes endurance numbers', () => {
    expect(
      enduranceSummary({ maxHr: 188, restingHr: 52, thresholdPaceSeconds: 270, ftpWatts: 240 }),
    ).toBe('Max HR 188 · resting 52 · threshold 4:30 /km · FTP 240 W')
    expect(
      enduranceSummary({ maxHr: null, restingHr: null, thresholdPaceSeconds: null, ftpWatts: 240 }),
    ).toBe('FTP 240 W')
    expect(
      enduranceSummary({
        maxHr: null,
        restingHr: null,
        thresholdPaceSeconds: null,
        ftpWatts: null,
      }),
    ).toBeNull()
  })
})

describe('enduranceTargets', () => {
  const none = { targetPaceSeconds: null, targetHrZone: null }
  it('is empty with no targets', () => {
    expect(enduranceTargets(none)).toEqual([])
  })
  it('makes zones and power personal when the numbers are known', () => {
    const ex = {
      targetPaceSeconds: 330,
      targetHrZone: 2,
      targetPowerPct: 90,
      targetCadence: 90,
      targetRpe: 7,
      targetElevationM: 350,
    }
    expect(enduranceTargets(ex, { maxHr: 190, restingHr: 50, ftpWatts: 240 })).toEqual([
      '5:30 /km',
      'Zone 2 · 134–148 bpm',
      '90% FTP · 216 W',
      '90 rpm',
      'RPE 7',
      '↑ 350 m',
    ])
    expect(enduranceTargets(ex)).toEqual([
      '5:30 /km',
      'Zone 2 · easy',
      '90% FTP',
      '90 rpm',
      'RPE 7',
      '↑ 350 m',
    ])
  })
})
