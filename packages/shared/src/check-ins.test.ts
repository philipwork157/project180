import { describe, expect, it } from 'vitest'
import { checkInPeriod, checkInVerdict, nextCheckInDate } from './check-ins'

const base = {
  daysLogged: 12,
  days: 14,
  avgKcal: 1800,
  maintenance: 2300,
  avgBurned: 0,
  weightChangeKg: -0.6,
  proteinDaysHit: 10,
  workoutsDone: 6,
}

describe('check-in verdict', () => {
  it('says a lose-fat client in a deficit is on track, with the expected pace', () => {
    const v = checkInVerdict({ ...base, goal: 'lose_fat' })
    expect(v.status).toBe('on_track')
    expect(v.detail).toContain('500 kcal a day under maintenance')
    expect(v.detail).toContain('-0.45 kg a week')
    expect(v.detail).toContain('Weight down 0.6 kg')
  })

  it('flags a lose-fat client eating over maintenance', () => {
    const v = checkInVerdict({ ...base, goal: 'lose_fat', avgKcal: 2600 })
    expect(v).toMatchObject({ status: 'off_track', headline: 'Not in a deficit' })
  })

  it('counts what they burned on top of maintenance', () => {
    const v = checkInVerdict({ ...base, goal: 'maintain', avgKcal: 2600, avgBurned: 300 })
    expect(v.status).toBe('on_track')
  })

  it('needs protein and training to build muscle', () => {
    expect(checkInVerdict({ ...base, goal: 'build_muscle', avgKcal: 2500 }).status).toBe('on_track')
    expect(
      checkInVerdict({ ...base, goal: 'build_muscle', avgKcal: 2500, proteinDaysHit: 2 }).headline,
    ).toBe('Protein too low to build muscle')
  })

  it('is unclear with too little logged, no goal or no maintenance', () => {
    expect(checkInVerdict({ ...base, goal: 'lose_fat', daysLogged: 2 }).status).toBe('unclear')
    expect(checkInVerdict({ ...base, goal: null }).status).toBe('unclear')
    expect(checkInVerdict({ ...base, goal: 'recomp', maintenance: null }).status).toBe('unclear')
  })
})

describe('check-in dates', () => {
  it('schedules the next one a repeat later, always in the future', () => {
    expect(nextCheckInDate('2026-11-23', 2, '2026-11-23')).toBe('2026-12-07')
    // Done three weeks late with a weekly repeat: still the next future Monday.
    expect(nextCheckInDate('2026-11-02', 1, '2026-11-23')).toBe('2026-11-30')
    expect(nextCheckInDate('2026-11-23', null, '2026-11-23')).toBeNull()
  })

  it('covers the days since the last check-in, up to the due date or today', () => {
    expect(
      checkInPeriod({ lastDone: '2026-11-09', dueDate: '2026-11-23', today: '2026-11-20' }),
    ).toEqual({ from: '2026-11-10', to: '2026-11-20' })
    expect(checkInPeriod({ lastDone: null, dueDate: null, today: '2026-11-20' })).toEqual({
      from: '2026-11-07',
      to: '2026-11-20',
    })
  })
})
