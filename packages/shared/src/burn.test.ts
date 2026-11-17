import { describe, expect, it } from 'vitest'
import {
  activityKcal,
  type BurnSet,
  cardioMet,
  MAX_WORKOUT_MINUTES,
  metKcal,
  stepsKcal,
  workoutKcal,
} from './burn'

const strength = (n: number): BurnSet[] =>
  Array.from({ length: n }, () => ({
    category: 'strength',
    name: 'Squat',
    isWarmup: false,
    durationSeconds: null,
    distanceM: null,
  }))

describe('burn estimates', () => {
  it('counts only what is above resting', () => {
    // (3.5 - 1) x 80 kg x 1 h = 200
    expect(metKcal(3.5, 80, 60)).toBe(200)
    expect(metKcal(1, 80, 60)).toBe(0)
  })

  it('estimates an activity by its kind', () => {
    // run 9.8: 8.8 x 70 x 0.5 = 308
    expect(activityKcal('run', 30, 70)).toBe(308)
    expect(activityKcal('walk', 60, 70)).toBe(175)
  })

  it('counts steps above the everyday baseline', () => {
    expect(stepsKcal(3000, 80)).toBe(0)
    expect(stepsKcal(10_000, 80)).toBe(240)
  })

  it('reads cardio from its name and pace', () => {
    expect(cardioMet('Treadmill incline walk', null)).toBe(6)
    expect(cardioMet('Easy run', 10)).toBeCloseTo(10.3, 1)
    expect(cardioMet('Walk', 5)).toBeCloseTo(4, 1)
    expect(cardioMet('Assault bike', null)).toBe(7)
    expect(cardioMet('Mystery machine', null)).toBe(6)
  })

  it('estimates a strength workout from its duration', () => {
    // 45 min at 3.5: 2.5 x 80 x 0.75 = 150
    expect(workoutKcal(strength(12), 45 * 60, 80)).toBe(150)
  })

  it('uses two minutes a set when there is no duration', () => {
    expect(workoutKcal(strength(15), null, 80)).toBe(100)
  })

  it('caps a workout left open for hours', () => {
    const capped = workoutKcal(strength(10), 6 * 3600, 80)
    expect(capped).toBe(metKcal(3.5, 80, MAX_WORKOUT_MINUTES))
  })

  it('counts cardio sets by their own MET and the rest as strength', () => {
    const sets: BurnSet[] = [
      ...strength(6),
      {
        category: 'cardio',
        name: 'Treadmill incline walk',
        isWarmup: false,
        durationSeconds: 20 * 60,
        distanceM: null,
      },
    ]
    // cardio: 5 x 80 x 20/60 = 133.3; strength: 40 min left: 2.5 x 80 x 40/60 = 133.3
    expect(workoutKcal(sets, 60 * 60, 80)).toBe(266)
  })

  it('a cardio-only workout is just its cardio', () => {
    const run: BurnSet = {
      category: 'cardio',
      name: 'Run',
      isWarmup: false,
      durationSeconds: 30 * 60,
      distanceM: 5000,
    }
    expect(workoutKcal([run], 40 * 60, 70)).toBe(metKcal(cardioMet('Run', 10), 70, 30))
  })
})
