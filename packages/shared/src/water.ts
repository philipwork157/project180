// Water: a daily goal in ml (set by the coach or the person themselves) and what they drank,
// logged a glass or bottle at a time so Undo takes back the last one.
import { z } from 'zod'
import { isoDate } from './validators'

/** The quick amounts on the Fuel screen: a glass and a bottle. */
export const WATER_QUICK_ML = [250, 500] as const
/** Goals people can pick from (any amount in range is allowed). */
export const WATER_GOAL_PRESETS_ML = [2000, 2500, 3000, 3500, 4000] as const
export const MIN_WATER_GOAL_ML = 500
export const MAX_WATER_GOAL_ML = 8000
/** The most one log may add (a big bottle). */
export const MAX_WATER_LOG_ML = 2000

export interface WaterLog {
  id: number
  ml: number
  createdAt: string
}

/** One day's water: the goal, how much so far, and each log (oldest first). */
export interface WaterDay {
  date: string
  goalMl: number | null
  ml: number
  logs: WaterLog[]
}

/** Water per day over a range (only days with water), for the coach's card. */
export interface WaterSummary {
  from: string
  to: string
  goalMl: number | null
  days: Array<{ date: string; ml: number }>
}

export const addWaterInput = z.object({
  clientUuid: z.uuid(),
  date: isoDate,
  ml: z.number().int().min(1).max(MAX_WATER_LOG_ML),
})

/** A goal in ml, rounded to the nearest 50 ml; null clears it. */
export const waterGoalInput = z.object({
  goalMl: z
    .number()
    .int()
    .min(MIN_WATER_GOAL_ML)
    .max(MAX_WATER_GOAL_ML)
    .transform((ml) => Math.round(ml / 50) * 50)
    .nullable(),
})

/** 3000 → "3 L", 2750 → "2.75 L", 250 → "250 ml". */
export function formatWater(ml: number): string {
  if (Math.abs(ml) < 1000) return `${Math.round(ml)} ml`
  const litres = Math.round(ml / 10) / 100
  return `${litres.toString()} L`
}

/** Litres typed by a person ("3", "2,5", "2.75") → ml, or null if it isn't a number. */
export function litresToMl(text: string): number | null {
  const n = Number.parseFloat(text.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1000) : null
}

/** How far along the goal is, 0–1 (can pass 1 when they drank more). Null without a goal. */
export function waterProgress(ml: number, goalMl: number | null): number | null {
  if (!goalMl || goalMl <= 0) return null
  return Math.max(0, ml) / goalMl
}
