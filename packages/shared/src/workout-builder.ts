// "Build with Claude": a coach describes a workout in words and Claude puts one together from
// the exercise library. It only ever creates a new workout; nothing existing is changed.
import { z } from 'zod'
import type { ProgramDetail, WorkoutDetail } from './types'

/** What the coach types: "45 min upper body, dumbbells only, beginner". */
export const workoutBuildInput = z.object({
  prompt: z
    .string()
    .trim()
    .min(10, 'Describe the workout in a few more words')
    .max(1000, 'Keep it under 1 000 characters'),
})

/** The new workout, plus what Claude wanted but the library doesn't have. */
export interface WorkoutBuildResult {
  workout: WorkoutDetail
  /** Exercises Claude would have used, but which aren't in the library (nothing is added). */
  missing: string[]
  /** A short note from Claude about the workout, if any. */
  note: string | null
}

/** What the coach types for a program: "8 weeks, 3 days a week, full body, beginner, gym". */
export const programBuildInput = z.object({
  prompt: z
    .string()
    .trim()
    .min(10, 'Describe the program in a few more words')
    .max(1000, 'Keep it under 1 000 characters'),
})

/**
 * "Build with Claude" for programs. It only ever creates: one new program, plus new workouts
 * where the library had nothing that fit. Existing workouts it schedules are used as they are.
 */
export interface ProgramBuildResult {
  program: ProgramDetail
  /** Workouts made for this program (new in the library). */
  newWorkouts: Array<{ id: number; name: string; exercises: number }>
  /** Workouts already in the library that the program uses, unchanged. */
  reusedWorkouts: Array<{ id: number; name: string }>
  /** Exercises Claude would have used, but which aren't in the library (nothing is added). */
  missing: string[]
  note: string | null
}

/** An On/Off switch the owner sets in Settings, for a feature that needs the Claude API key. */
export interface ClaudeFeatureSettings {
  enabled: boolean
  configured: boolean
  updatedAt: string | null
}

export const claudeFeatureInput = z.object({ enabled: z.boolean() })
