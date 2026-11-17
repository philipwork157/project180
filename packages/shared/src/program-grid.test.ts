import { describe, expect, it } from 'vitest'
import {
  cellKey,
  clearWeek,
  copyDayToAllWeeks,
  swapCells,
  swapWeeks,
  weekFilled,
} from './program-grid'

describe('swapCells', () => {
  const cells = {
    [cellKey(1, 1)]: { workoutId: 10, checkinRequired: true },
    [cellKey(1, 2)]: { workoutId: 20, checkinRequired: false },
  }

  it('swaps the workout and the weigh-in of two days', () => {
    const out = swapCells(cells, '1:1', '1:2')
    expect(out['1:1']).toEqual({ workoutId: 20, checkinRequired: false })
    expect(out['1:2']).toEqual({ workoutId: 10, checkinRequired: true })
    // The original is untouched (undo keeps the old draft).
    expect(cells['1:1']).toEqual({ workoutId: 10, checkinRequired: true })
  })

  it('moves a workout onto a rest day across weeks', () => {
    const out = swapCells(cells, '1:2', '3:5')
    expect(out['3:5']).toEqual({ workoutId: 20, checkinRequired: false })
    expect(out['1:2']).toEqual({ workoutId: null, checkinRequired: false })
  })

  it('changes nothing when a day is dropped on itself or on an identical day', () => {
    expect(swapCells(cells, '1:1', '1:1')).toBe(cells)
    expect(swapCells(cells, '2:1', '2:2')).toBe(cells)
  })
})

describe('week tools', () => {
  const cells = {
    [cellKey(1, 1)]: { workoutId: 10, checkinRequired: true },
    [cellKey(1, 3)]: { workoutId: 30, checkinRequired: false },
    [cellKey(2, 2)]: { workoutId: 20, checkinRequired: false },
  }

  it('swaps two whole weeks, rest days included', () => {
    const out = swapWeeks(cells, 1, 2)
    expect(out['2:1']).toEqual({ workoutId: 10, checkinRequired: true })
    expect(out['2:3']).toEqual({ workoutId: 30, checkinRequired: false })
    expect(out['1:2']).toEqual({ workoutId: 20, checkinRequired: false })
    expect(out['1:1']).toEqual({ workoutId: null, checkinRequired: false })
    expect(swapWeeks(cells, 2, 2)).toBe(cells)
  })

  it('clears one week and leaves the others', () => {
    const out = clearWeek(cells, 1)
    expect(weekFilled(out, 1)).toBe(0)
    expect(weekFilled(out, 2)).toBe(1)
    expect(weekFilled(cells, 1)).toBe(2)
  })

  it('copies one day to the same day of every week', () => {
    const out = copyDayToAllWeeks(cells, 3, 1, 1)
    for (const w of [1, 2, 3])
      expect(out[cellKey(w, 1)]).toEqual({ workoutId: 10, checkinRequired: true })
    expect(out['2:2']).toEqual({ workoutId: 20, checkinRequired: false })
  })
})
