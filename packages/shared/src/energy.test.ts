import { describe, expect, it } from 'vitest'
import {
  ageOn,
  type EnergyInputs,
  energyMissing,
  energyPlan,
  kcalFloor,
  kcalStatus,
  needsRecalc,
  paceLabel,
  suggestedPace,
} from './energy'

const base: EnergyInputs = {
  birthDate: '1990-06-15',
  sex: 'male',
  heightCm: 180,
  weightKg: 90,
  activity: 'active',
  weeklyChangeKg: 0,
  goalWeightKg: null,
  today: '2026-11-16',
}

describe('energyPlan', () => {
  it('works out resting burn and maintenance (Mifflin-St Jeor)', () => {
    const p = energyPlan(base)
    // 10*90 + 6.25*180 - 5*36 + 5 = 1850; x1.45 (active, workouts not counted) = 2682.5 -> 2680
    expect(p?.age).toBe(36)
    expect(p?.bmr).toBe(1850)
    expect(p?.maintenance).toBe(2680)
    expect(p?.kcal).toBe(2680)
    expect(p?.weeklyChangeKg).toBe(0)
    expect(p?.goalDate).toBeNull()
  })

  it('takes a daily deficit off for a weekly pace, and dates the goal', () => {
    const p = energyPlan({ ...base, weeklyChangeKg: -0.5, goalWeightKg: 80 })
    // 0.5 kg * 7700 / 7 = 550
    expect(p?.kcal).toBe(2130)
    expect(p?.floored).toBe(false)
    expect(p?.weeksToGoal).toBe(20)
    expect(p?.goalDate).toBe('2027-04-05')
  })

  it('splits calories into protein, fat and carbs that add back up', () => {
    const p = energyPlan({ ...base, weeklyChangeKg: -0.5, goalWeightKg: 80 })
    if (!p) throw new Error('no plan')
    expect(p.proteinG).toBe(160) // 2 g x the 80 kg goal while losing
    expect(p.fatG).toBe(59) // 25%
    expect(Math.abs(p.proteinG * 4 + p.fatG * 9 + p.carbsG * 4 - p.kcal)).toBeLessThan(4)
  })

  it('never suggests below the floor and says so', () => {
    const small: EnergyInputs = {
      ...base,
      sex: 'female',
      weightKg: 52,
      heightCm: 158,
      activity: 'sedentary',
      weeklyChangeKg: -0.75,
    }
    const p = energyPlan(small)
    expect(p?.floored).toBe(true)
    expect(p?.kcal).toBe(kcalFloor(p?.bmr ?? 0, 'female'))
    expect(p?.kcal).toBeGreaterThanOrEqual(1200)
    // The real pace at the floor is slower than asked.
    expect(p?.weeklyChangeKg).toBeGreaterThan(-0.75)
  })

  it('adds a surplus to gain', () => {
    const p = energyPlan({ ...base, weeklyChangeKg: 0.25, goalWeightKg: 95 })
    expect(p?.kcal).toBe(2960) // 2680 + 275
    expect(p?.goalDate).not.toBeNull()
    expect(p?.goalMismatch).toBe(false)
  })

  it('flags a goal weight the other way from the pace', () => {
    const p = energyPlan({ ...base, weeklyChangeKg: 0.25, goalWeightKg: 80 })
    expect(p?.goalMismatch).toBe(true)
    expect(p?.goalDate).toBeNull()
  })

  it('needs every input, and says which are missing', () => {
    expect(energyPlan({ ...base, activity: null })).toBeNull()
    expect(energyMissing({ ...base, weightKg: null, sex: null })).toEqual(['weight', 'sex'])
    expect(energyMissing(base)).toEqual([])
  })
})

describe('helpers', () => {
  it('ages on a day', () => {
    expect(ageOn('1990-06-15', '2026-06-14')).toBe(35)
    expect(ageOn('1990-06-15', '2026-06-15')).toBe(36)
  })

  it('labels paces and suggests one from the goal', () => {
    expect(paceLabel(-0.5)).toBe('Lose 0.5 kg a week')
    expect(paceLabel(0)).toBe('Keep the same weight')
    expect(paceLabel(0.25)).toBe('Gain 0.25 kg a week')
    expect(suggestedPace(90, 80)).toBe(-0.5)
    expect(suggestedPace(70, 75)).toBe(0.25)
    expect(suggestedPace(70, 70.5)).toBe(0)
    expect(suggestedPace(null, 70)).toBe(0)
  })

  it('suggests recalculating after 2 kg either way', () => {
    expect(needsRecalc(90, 88)).toBe(true)
    expect(needsRecalc(90, 91.5)).toBe(false)
    expect(needsRecalc(null, 80)).toBe(false)
  })

  it('reads a day as left, on target (5%) or over', () => {
    expect(kcalStatus(1500, 2000)).toBe('left')
    expect(kcalStatus(1950, 2000)).toBe('on_target')
    expect(kcalStatus(2100, 2000)).toBe('on_target')
    expect(kcalStatus(2101, 2000)).toBe('over')
  })
})
