import { describe, expect, it } from 'vitest'
import { addWaterInput, formatWater, litresToMl, waterGoalInput, waterProgress } from './water'

const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('formatWater', () => {
  it('shows ml under a litre and litres from there', () => {
    expect(formatWater(0)).toBe('0 ml')
    expect(formatWater(250)).toBe('250 ml')
    expect(formatWater(1000)).toBe('1 L')
    expect(formatWater(2750)).toBe('2.75 L')
    expect(formatWater(3000)).toBe('3 L')
    expect(formatWater(3333)).toBe('3.33 L')
  })
})

describe('litresToMl', () => {
  it('reads what people type, with a comma or a point', () => {
    expect(litresToMl('3')).toBe(3000)
    expect(litresToMl('2,5')).toBe(2500)
    expect(litresToMl(' 2.75 ')).toBe(2750)
  })

  it('is null for anything that isn’t a positive number', () => {
    expect(litresToMl('')).toBeNull()
    expect(litresToMl('lots')).toBeNull()
    expect(litresToMl('0')).toBeNull()
    expect(litresToMl('-1')).toBeNull()
  })
})

describe('waterProgress', () => {
  it('is the share of the goal, and can pass 1', () => {
    expect(waterProgress(1500, 3000)).toBe(0.5)
    expect(waterProgress(3500, 3000)).toBeCloseTo(1.1667, 3)
  })

  it('is null without a goal', () => {
    expect(waterProgress(1000, null)).toBeNull()
    expect(waterProgress(1000, 0)).toBeNull()
  })
})

describe('water inputs', () => {
  it('accepts a glass, refuses nothing or a bucket', () => {
    expect(addWaterInput.safeParse({ clientUuid: uuid, date: '2026-11-14', ml: 250 }).success).toBe(
      true,
    )
    expect(addWaterInput.safeParse({ clientUuid: uuid, date: '2026-11-14', ml: 0 }).success).toBe(
      false,
    )
    expect(
      addWaterInput.safeParse({ clientUuid: uuid, date: '2026-11-14', ml: 5000 }).success,
    ).toBe(false)
  })

  it('rounds a goal to 50 ml, keeps it in range, and null clears it', () => {
    expect(waterGoalInput.parse({ goalMl: 3010 })).toEqual({ goalMl: 3000 })
    expect(waterGoalInput.parse({ goalMl: null })).toEqual({ goalMl: null })
    expect(waterGoalInput.safeParse({ goalMl: 100 }).success).toBe(false)
    expect(waterGoalInput.safeParse({ goalMl: 20000 }).success).toBe(false)
  })
})
