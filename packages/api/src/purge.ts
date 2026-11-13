// Permanent deletes for workouts and programs, including the history that hangs off them.
import {
  bodyCheckins,
  type Db,
  enrollments,
  programDays,
  programs,
  setLogs,
  users,
  workoutSessions,
  workouts,
} from '@project180/db'
import type { Me } from '@project180/shared'
import { and, count, countDistinct, eq, inArray, ne, or, type SQL } from 'drizzle-orm'
import { conflict } from './errors'

export interface PurgeImpact {
  /** Programs that schedule this workout (workouts only). */
  programs: Array<{ id: number; name: string }>
  /** People currently on it (programs only). */
  people: string[]
  sessions: number
  loggedSets: number
  otherPeoplesSessions: number
}

function workoutSessionFilter(workoutId: number) {
  return eq(workoutSessions.workoutId, workoutId)
}

function programSessionFilter(db: Db, programId: number) {
  return or(
    inArray(
      workoutSessions.enrollmentId,
      db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(eq(enrollments.programId, programId)),
    ),
    inArray(
      workoutSessions.programDayId,
      db
        .select({ id: programDays.id })
        .from(programDays)
        .where(eq(programDays.programId, programId)),
    ),
  )
}

async function historyCounts(db: Db, user: Me, filter: SQL | undefined) {
  const [s] = await db.select({ n: count() }).from(workoutSessions).where(filter)
  const [sets] = await db
    .select({ n: count() })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .where(filter)
  const [others] = await db
    .select({ n: countDistinct(workoutSessions.id) })
    .from(workoutSessions)
    .where(and(filter, ne(workoutSessions.userId, user.id)))
  return { sessions: s?.n ?? 0, loggedSets: sets?.n ?? 0, otherPeoplesSessions: others?.n ?? 0 }
}

export async function workoutImpact(db: Db, user: Me, workoutId: number): Promise<PurgeImpact> {
  const scheduled = await db
    .selectDistinct({ id: programs.id, name: programs.name })
    .from(programDays)
    .innerJoin(programs, eq(programs.id, programDays.programId))
    .where(eq(programDays.workoutId, workoutId))
  return {
    programs: scheduled,
    people: [],
    ...(await historyCounts(db, user, workoutSessionFilter(workoutId))),
  }
}

export async function programImpact(db: Db, user: Me, programId: number): Promise<PurgeImpact> {
  const people = await db
    .select({ name: users.name })
    .from(enrollments)
    .innerJoin(users, eq(users.id, enrollments.userId))
    .where(and(eq(enrollments.programId, programId), eq(enrollments.status, 'active')))
  return {
    programs: [],
    people: people.map((p) => p.name),
    ...(await historyCounts(db, user, programSessionFilter(db, programId))),
  }
}

/**
 * Deletes a workout with its logged sessions and sets. Refused while a program still schedules it:
 * take it off those days (or delete the program) first, so no program quietly loses a workout.
 */
export async function purgeWorkout(db: Db, user: Me, workoutId: number) {
  const impact = await workoutImpact(db, user, workoutId)
  if (impact.programs.length) {
    const names = impact.programs.map((p) => p.name).join(', ')
    conflict(
      `It's still in ${impact.programs.length === 1 ? 'a program' : `${impact.programs.length} programs`} (${names}). Take it out of ${impact.programs.length === 1 ? 'that program' : 'those programs'} first.`,
    )
  }
  await db.batch([
    // set_logs go with their session (ON DELETE CASCADE).
    db.delete(workoutSessions).where(workoutSessionFilter(workoutId)),
    // workout_exercises go with the workout (ON DELETE CASCADE).
    db.delete(workouts).where(eq(workouts.id, workoutId)),
  ])
}

/** Deletes a program, its schedule, assignments and the sessions logged as part of it. */
export async function purgeProgram(db: Db, programId: number) {
  const programEnrollments = db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(eq(enrollments.programId, programId))
  await db.batch([
    db.delete(workoutSessions).where(programSessionFilter(db, programId)),
    db
      .update(bodyCheckins)
      .set({ enrollmentId: null })
      .where(inArray(bodyCheckins.enrollmentId, programEnrollments)),
    db.delete(enrollments).where(eq(enrollments.programId, programId)),
    // program_days go with the program (ON DELETE CASCADE).
    db.delete(programs).where(eq(programs.id, programId)),
  ])
}
