import { describe, expect, it } from 'vitest'
import {
  addFoodInput,
  energySplit,
  mealForHour,
  nutritionTargetsInput,
  scaleLabel,
  sumMacros,
  targetShare,
  updateFoodInput,
} from './food'

const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('sumMacros', () => {
  it('adds up foods, counting empty carbs and fat as zero, and rounds', () => {
    expect(
      sumMacros([
        { kcal: 165.4, proteinG: 31.04, carbsG: 0, fatG: 3.6 },
        { kcal: 130, proteinG: 2.7, carbsG: 28.2, fatG: null },
        { kcal: 50.3, proteinG: 0.33 },
      ]),
    ).toEqual({ kcal: 346, proteinG: 34.1, carbsG: 28.2, fatG: 3.6 })
  })

  it('is all zeros for an empty day', () => {
    expect(sumMacros([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
  })
})

describe('scaleLabel', () => {
  it('turns per-100 g label values into the amount eaten', () => {
    const per100g = { kcal: 380, proteinG: 12.5, carbsG: 64, fatG: 7.2 }
    expect(scaleLabel(per100g, 45)).toEqual({ kcal: 171, proteinG: 5.6, carbsG: 28.8, fatG: 3.2 })
    expect(scaleLabel(per100g, -5)).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
  })
})

describe('mealForHour', () => {
  it('guesses the meal from the time of day', () => {
    expect(mealForHour(7)).toBe('breakfast')
    expect(mealForHour(12)).toBe('lunch')
    expect(mealForHour(16)).toBe('snack')
    expect(mealForHour(19)).toBe('dinner')
    expect(mealForHour(23)).toBe('snack')
    expect(mealForHour(2)).toBe('snack')
  })
})

describe('targetShare', () => {
  it('is the share of the target eaten, capped at full, and zero without a target', () => {
    expect(targetShare(75, 150)).toBe(0.5)
    expect(targetShare(200, 150)).toBe(1)
    expect(targetShare(50, null)).toBe(0)
    expect(targetShare(50, 0)).toBe(0)
  })
})

describe('food validators', () => {
  it('accepts a typed food with only calories and protein', () => {
    const parsed = addFoodInput.parse({
      date: '2026-11-14',
      meal: 'lunch',
      entries: [{ clientUuid: uuid, name: ' Chicken wrap ', kcal: 420, proteinG: 32 }],
    })
    expect(parsed.source).toBe('manual')
    expect(parsed.entries[0]?.name).toBe('Chicken wrap')
  })

  it('refuses empty names, negative numbers, unknown meals and too many foods', () => {
    const base = { date: '2026-11-14', meal: 'lunch' }
    const food = { clientUuid: uuid, name: 'Rice', kcal: 200, proteinG: 4 }
    expect(addFoodInput.safeParse({ ...base, entries: [{ ...food, name: '  ' }] }).success).toBe(
      false,
    )
    expect(addFoodInput.safeParse({ ...base, entries: [{ ...food, kcal: -1 }] }).success).toBe(
      false,
    )
    expect(addFoodInput.safeParse({ ...base, meal: 'brunch', entries: [food] }).success).toBe(false)
    expect(addFoodInput.safeParse({ ...base, entries: [] }).success).toBe(false)
    expect(
      addFoodInput.safeParse({ ...base, entries: Array.from({ length: 13 }, () => food) }).success,
    ).toBe(false)
  })

  it('lets an edit change just one field', () => {
    expect(updateFoodInput.parse({ meal: 'dinner' })).toEqual({ meal: 'dinner' })
  })

  it('keeps targets sensible', () => {
    expect(nutritionTargetsInput.safeParse({ kcal: 2200, proteinG: 150 }).success).toBe(true)
    expect(nutritionTargetsInput.safeParse({ kcal: 300, proteinG: 150 }).success).toBe(false)
    expect(nutritionTargetsInput.safeParse({ kcal: 2200, proteinG: 150.5 }).success).toBe(false)
  })
})

describe('energySplit', () => {
  it('is the share of energy from each macro (fat counts 9 kcal a gram)', () => {
    const split = energySplit({ proteinG: 25, carbsG: 50, fatG: 100 / 9 })
    expect(Math.round(split.proteinG * 100)).toBe(25)
    expect(Math.round(split.carbsG * 100)).toBe(50)
    expect(Math.round(split.fatG * 100)).toBe(25)
    expect(energySplit({ proteinG: 0, carbsG: 0, fatG: 0 })).toEqual({
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    })
  })
})
