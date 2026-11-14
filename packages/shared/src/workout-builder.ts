// "Build with Claude": a coach describes a workout in words and Claude puts one together from
// the exercise library. It only ever creates a new workout; nothing existing is changed.
import { z } from 'zod'
import type { WorkoutDetail } from './types'

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

/** An On/Off switch the owner sets in Settings, for a feature that needs the Claude API key. */
export interface ClaudeFeatureSettings {
  enabled: boolean
  configured: boolean
  updatedAt: string | null
}
