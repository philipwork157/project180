import { describe, expect, it } from 'vitest'
import {
  addFoodInput,
  energySplit,
  foodReminderNotification,
  foodSearchInput,
  foodStreak,
  forGrams,
  mealForHour,
  normalizeFoodQuery,
  nutritionTargetsInput,
  perGram,
  rankFoodResults,
  scaleLabel,
  sumExtras,
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

describe('food search', () => {
  const food = (name: string, brand: string | null = null, kcal = 140, proteinG = 12) => ({
    name,
    brand,
    per100g: { kcal, proteinG, carbsG: 1, fatG: 10 },
  })

  it('reads what was typed the same way however it was typed', () => {
    expect(normalizeFoodQuery('  Free   Range EGGS ')).toBe('free range eggs')
    expect(foodSearchInput.safeParse('e').success).toBe(false)
    expect(foodSearchInput.parse(' egg ')).toBe('egg')
    expect(foodSearchInput.safeParse('x'.repeat(61)).success).toBe(false)
  })

  it('puts the closest names first and keeps the providers’ order otherwise', () => {
    const list = [
      food('Eggplant dip'),
      food('Mayonnaise with egg'),
      food('Large free range eggs', 'Woolworths'),
      food('Egg, whole, raw'),
      food('Chicken breast'),
    ]
    expect(rankFoodResults('egg', list).map((f) => f.name)).toEqual([
      'Egg, whole, raw',
      'Mayonnaise with egg',
      'Large free range eggs',
      'Eggplant dip',
      'Chicken breast',
    ])
    // Plurals still match the start of a word.
    expect(rankFoodResults('eggs whole', list)[0]?.name).toBe('Egg, whole, raw')
  })

  it('drops repeats and foods with nothing to log', () => {
    const list = [
      food('Eggs', 'Nulaid'),
      food('eggs ', 'NULAID'),
      food('Eggs', 'Other brand'),
      food('Egg shells', null, 0, 0),
    ]
    expect(rankFoodResults('egg', list).map((f) => f.brand)).toEqual(['Nulaid', 'Other brand'])
  })
})

describe('extras and streaks', () => {
  it('adds up fibre, sugar and sodium, leaving unknowns out', () => {
    expect(
      sumExtras([
        { fibreG: 3.2, sugarG: null, sodiumMg: 120.4 },
        { fibreG: 1.1, sodiumMg: 300 },
        {},
      ]),
    ).toEqual({ fibreG: 4.3, sugarG: null, sodiumMg: 420 })
    expect(sumExtras([])).toEqual({ fibreG: null, sugarG: null, sodiumMg: null })
  })

  it('counts days in a row, not breaking on a today with nothing yet', () => {
    const days = ['2026-11-13', '2026-11-14', '2026-11-15']
    expect(foodStreak(days, '2026-11-16')).toBe(3)
    expect(foodStreak([...days, '2026-11-16'], '2026-11-16')).toBe(4)
    expect(foodStreak(['2026-11-14'], '2026-11-16')).toBe(0)
    expect(foodStreak([], '2026-11-16')).toBe(0)
  })
})

describe('food reminder in the bell', () => {
  const base = { on: true, today: '2026-11-16', hour: 19, mealsToday: 1 }
  it('shows from 19:00 when fewer than two meals are logged', () => {
    expect(foodReminderNotification(base)?.id).toBe('food:2026-11-16')
    expect(foodReminderNotification({ ...base, hour: 18 })).toBeNull()
    expect(foodReminderNotification({ ...base, mealsToday: 2 })).toBeNull()
    expect(foodReminderNotification({ ...base, on: false })).toBeNull()
  })
})

describe('numbers follow the grams', () => {
  const banana = {
    kcal: 18,
    proteinG: 0.2,
    carbsG: 4.6,
    fatG: 0.1,
    fibreG: 0.5,
    sugarG: 2.4,
    sodiumMg: 0,
  }

  it('scales every number from the weight it was estimated at', () => {
    const basis = perGram(banana, 20)
    expect(basis).not.toBeNull()
    expect(forGrams(basis as NonNullable<typeof basis>, 80)).toEqual({
      kcal: 72,
      proteinG: 0.8,
      carbsG: 18.4,
      fatG: 0.4,
      fibreG: 2,
      sugarG: 9.6,
      sodiumMg: 0,
    })
  })

  it('adds no rounding errors while typing digit by digit', () => {
    const basis = perGram({ kcal: 89, proteinG: 1.1, carbsG: null }, 100)
    if (!basis) throw new Error('no basis')
    for (const g of [1, 10, 100]) forGrams(basis, g)
    expect(forGrams(basis, 100)).toMatchObject({ kcal: 89, proteinG: 1.1, carbsG: null })
    expect(forGrams(basis, 0)).toMatchObject({ kcal: 0, proteinG: 0 })
  })

  it('has nothing to work from without a weight', () => {
    expect(perGram(banana, null)).toBeNull()
    expect(perGram(banana, 0)).toBeNull()
  })
})
