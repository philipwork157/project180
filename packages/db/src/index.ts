import { drizzle } from 'drizzle-orm/d1'
import * as schema from './schema'

export * from './schema'
export { schema }

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Db = ReturnType<typeof createDb>

export type UserRow = typeof schema.users.$inferSelect
export type ExerciseRow = typeof schema.exercises.$inferSelect
export type WorkoutRow = typeof schema.workouts.$inferSelect
export type ProgramRow = typeof schema.programs.$inferSelect
export type WorkoutSessionRow = typeof schema.workoutSessions.$inferSelect
export type SetLogRow = typeof schema.setLogs.$inferSelect
