import { describe, expect, it } from 'vitest'
import { cellKey, swapCells } from './program-grid'

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
