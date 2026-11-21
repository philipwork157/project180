// Deleting a person and everything they logged, for good (POPIA). Used by an owner deleting
// someone in their business, and by a client deleting their own account in the app.
import {
  appActivity,
  bodyCheckins,
  type Db,
  enrollments,
  exerciseAlternatives,
  exercises,
  invitations,
  programs,
  recipes,
  signInAttempts,
  users,
  workoutSessions,
  workouts,
} from '@project180/db'
import type { DeletePersonResult } from '@project180/shared'
import { and, count, eq, isNull } from 'drizzle-orm'

/**
 * Deletes them and everything they logged in one batch (all of it or none of it). What other
 * people still use (clients they coach, library they built) is handed to `handTo` first. Their
 * food, water, chats, sign-ins and profile go with them (the database cascades those).
 */
export async function deletePersonForGood(
  db: Db,
  id: number,
  handTo: number,
): Promise<DeletePersonResult> {
  const n = (rows: { n: number }[]) => rows[0]?.n ?? 0
  const [[row], sessionRows, checkinRows, clientRows, exerciseRows, workoutRows, programRows] =
    await Promise.all([
      db.select({ email: users.email }).from(users).where(eq(users.id, id)),
      db.select({ n: count() }).from(workoutSessions).where(eq(workoutSessions.userId, id)),
      db.select({ n: count() }).from(bodyCheckins).where(eq(bodyCheckins.userId, id)),
      db.select({ n: count() }).from(users).where(eq(users.coachId, id)),
      db.select({ n: count() }).from(exercises).where(eq(exercises.createdBy, id)),
      db
        .select({ n: count() })
        .from(workouts)
        .where(and(eq(workouts.createdBy, id), isNull(workouts.clientId))),
      db
        .select({ n: count() })
        .from(programs)
        .where(and(eq(programs.createdBy, id), isNull(programs.clientId))),
    ])
  await db.batch([
    // Hand over what other people still use.
    db.update(users).set({ coachId: handTo }).where(eq(users.coachId, id)),
    db.update(exercises).set({ createdBy: handTo }).where(eq(exercises.createdBy, id)),
    db.update(workouts).set({ createdBy: handTo }).where(eq(workouts.createdBy, id)),
    db.update(programs).set({ createdBy: handTo }).where(eq(programs.createdBy, id)),
    db.update(recipes).set({ createdBy: handTo }).where(eq(recipes.createdBy, id)),
    db
      .update(exerciseAlternatives)
      .set({ createdBy: handTo })
      .where(eq(exerciseAlternatives.createdBy, id)),
    db.update(enrollments).set({ assignedBy: null }).where(eq(enrollments.assignedBy, id)),
    // Everything they logged (sets and session snapshots go with their sessions).
    db.delete(workoutSessions).where(eq(workoutSessions.userId, id)),
    db.delete(bodyCheckins).where(eq(bodyCheckins.userId, id)),
    db.delete(appActivity).where(eq(appActivity.userId, id)),
    db.delete(enrollments).where(eq(enrollments.userId, id)),
    // Their own copies of programs and workouts (days, rows and groups go with them).
    db.delete(programs).where(eq(programs.clientId, id)),
    db.delete(workouts).where(eq(workouts.clientId, id)),
    db.delete(signInAttempts).where(eq(signInAttempts.key, `email:${row?.email ?? ''}`)),
    // The link to the account their coach set up (the column has no cascade: added later).
    db.delete(invitations).where(eq(invitations.userId, id)),
    // Last: the person (sign-ins, devices and profile go with them).
    db.delete(users).where(eq(users.id, id)),
  ])
  const result: DeletePersonResult = {
    removed: { workouts: n(sessionRows), checkins: n(checkinRows) },
    handedOver: {
      clients: n(clientRows),
      exercises: n(exerciseRows),
      workouts: n(workoutRows),
      programs: n(programRows),
    },
  }
  return result
}
