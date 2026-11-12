import { describe, expect, it } from 'vitest'
import { mergeTargets, searchSwaps, splitTargets, swapSuggestions, swapsLabel } from './swaps'
import type { SwapCandidate, SwapOptions } from './types'

const ex = (
  id: number,
  name: string,
  muscleGroup: SwapCandidate['muscleGroup'] = 'legs',
  trackingType: SwapCandidate['trackingType'] = 'weight_reps',
): SwapCandidate => ({
  id,
  name,
  muscleGroup,
  equipment: 'other',
  trackingType,
  keywords: null,
  imageKey: null,
})

const exercises = [
  ex(1, 'Back Squat'),
  ex(2, 'Leg Press'),
  ex(3, 'Goblet Squat'),
  ex(4, 'Wall Sit', 'legs', 'time'),
  ex(5, 'Bench Press', 'chest'),
  ex(6, 'Walking Lunge', 'legs', 'reps'),
]
const squat = { exerciseId: 1, muscleGroup: 'legs' as const, trackingType: 'weight_reps' as const }

describe('swapSuggestions', () => {
  it('puts the coach picks first, then past swaps, then similar exercises', () => {
    const options: SwapOptions = { exercises, coach: { 1: [3] }, mine: { 1: [2, 3] } }
    const s = swapSuggestions(squat, options)
    expect(s.coach.map((e) => e.id)).toEqual([3])
    // Goblet squat is already a coach pick, so it's not repeated.
    expect(s.mine.map((e) => e.id)).toEqual([2])
    // Same muscle group, logged the same way first; never chest or the squat itself.
    expect(s.similar.map((e) => e.id)).toEqual([6, 4])
  })

  it('skips exercises already in the workout and ones that no longer exist', () => {
    const options: SwapOptions = { exercises, coach: { 1: [99, 2, 3] }, mine: {} }
    const s = swapSuggestions(squat, options, { exclude: [2] })
    expect(s.coach.map((e) => e.id)).toEqual([3])
    expect(s.similar.map((e) => e.id)).not.toContain(2)
  })

  it("uses the original exercise's alternatives after a swap", () => {
    const options: SwapOptions = { exercises, coach: { 1: [2, 3] }, mine: {} }
    const leg = {
      exerciseId: 2,
      muscleGroup: 'legs' as const,
      trackingType: 'weight_reps' as const,
    }
    const s = swapSuggestions(leg, options, { forExerciseId: 1, exclude: [1] })
    expect(s.coach.map((e) => e.id)).toEqual([3])
  })
})

describe('searchSwaps', () => {
  it('finds by name and puts the same muscle group first', () => {
    expect(searchSwaps(squat, exercises, 'press').map((e) => e.id)).toEqual([2, 5])
  })

  it('leaves out the exercise itself and excluded ones', () => {
    expect(searchSwaps(squat, exercises, 'squat', { exclude: [3] })).toEqual([])
  })
})

describe('splitTargets', () => {
  it('keeps logged sets on the original and moves the rest', () => {
    const t = { targetSets: 4, targetRepsMin: 8, targetRepsMax: 12, targetRepsPerSet: null }
    const { done, rest } = splitTargets(t, 2)
    expect(done).toEqual({ ...t, targetSets: 2 })
    expect(rest).toEqual({ ...t, targetSets: 2 })
  })

  it('splits set-by-set reps and updates the range', () => {
    const t = {
      targetSets: 4,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetRepsPerSet: [12, 10, 10, 8],
    }
    const { done, rest } = splitTargets(t, 1)
    expect(done).toEqual({
      targetSets: 1,
      targetRepsPerSet: [12],
      targetRepsMin: 12,
      targetRepsMax: 12,
    })
    expect(rest).toEqual({
      targetSets: 3,
      targetRepsPerSet: [10, 10, 8],
      targetRepsMin: 8,
      targetRepsMax: 10,
    })
  })

  it('always leaves at least one set for the replacement', () => {
    const t = {
      targetSets: 3,
      targetRepsMin: 10,
      targetRepsMax: 10,
      targetRepsPerSet: [10, 10, 10],
    }
    const { done, rest } = splitTargets(t, 4)
    expect(done.targetSets).toBe(4)
    expect(done.targetRepsPerSet).toEqual([10, 10, 10, 10])
    expect(rest).toEqual({
      targetSets: 1,
      targetRepsPerSet: [10],
      targetRepsMin: 10,
      targetRepsMax: 10,
    })
  })
})

describe('mergeTargets', () => {
  it('undoes a split', () => {
    const t = {
      targetSets: 4,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetRepsPerSet: [12, 10, 10, 8],
    }
    const { done, rest } = splitTargets(t, 1)
    expect(mergeTargets(done, rest)).toEqual(t)
  })
})

describe('swapsLabel', () => {
  it('lists each swap', () => {
    expect(
      swapsLabel([
        { from: 'Squat', to: 'Leg Press' },
        { from: 'Bench Press', to: 'Push-up' },
      ]),
    ).toBe('Squat → Leg Press, Bench Press → Push-up')
  })
})
