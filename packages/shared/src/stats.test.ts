import { describe, expect, it } from 'vitest'
import { average, bestOneRepMax, estimatedOneRepMax, heaviestSet, totalVolume } from './stats'

const sets = [
  { weightKg: 20, reps: 12, isWarmup: true },
  { weightKg: 40, reps: 10 },
  { weightKg: 42.5, reps: 8 },
  { weightKg: 42.5, reps: 8 },
  { weightKg: null, reps: 15 },
]

describe('totalVolume', () => {
  it('sums weight × reps over working sets only', () => {
    expect(totalVolume(sets)).toBe(400 + 340 + 340)
  })

  it('is 0 with no sets', () => {
    expect(totalVolume([])).toBe(0)
  })
})

describe('one-rep max', () => {
  it('uses the Epley formula', () => {
    expect(estimatedOneRepMax(100, 10)).toBe(133.3)
    expect(estimatedOneRepMax(60, 1)).toBe(60)
    expect(estimatedOneRepMax(0, 5)).toBeNull()
  })

  it('finds the best estimate, ignoring warm-ups', () => {
    expect(bestOneRepMax(sets)).toBe(53.8)
  })

  it('finds the heaviest working set', () => {
    expect(heaviestSet(sets)).toBe(42.5)
  })
})

describe('average', () => {
  it('ignores missing values', () => {
    expect(average([4, null, 5, undefined])).toBe(4.5)
    expect(average([])).toBeNull()
  })
})
