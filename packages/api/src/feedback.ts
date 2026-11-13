// A coach's likes and comments on a client's workouts, and the client reading them.
import {
  type Db,
  exercises,
  sessionExercises,
  sessionFeedback,
  setLogs,
  users,
  workoutSessions,
  workouts,
} from '@project180/db'
import type { FeedbackInput, FeedbackNews, Me, SessionFeedback } from '@project180/shared'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Context } from 'hono'
import type { AppEnv } from './env'
import { notFound } from './errors'
import { iso } from './library'
import { pushLater } from './push'
import { assertCanSend } from './rate-limit'

type SessionRow = typeof workoutSessions.$inferSelect

const columns = {
  id: sessionFeedback.id,
  sessionId: sessionFeedback.sessionId,
  exerciseId: sessionFeedback.exerciseId,
  kind: sessionFeedback.kind,
  body: sessionFeedback.body,
  authorId: sessionFeedback.authorId,
  authorName: users.name,
  createdAt: sessionFeedback.createdAt,
  readAt: sessionFeedback.readAt,
}

type Row = { createdAt: Date; readAt: Date | null }
const toJson = <T extends Row>(r: T) => ({
  ...r,
  createdAt: r.createdAt.toISOString(),
  readAt: iso(r.readAt),
})

/** Everything coaches left on one session, oldest first. */
export async function loadFeedback(db: Db, sessionId: number): Promise<SessionFeedback[]> {
  const rows = await db
    .select(columns)
    .from(sessionFeedback)
    .leftJoin(users, eq(users.id, sessionFeedback.authorId))
    .where(eq(sessionFeedback.sessionId, sessionId))
    .orderBy(asc(sessionFeedback.createdAt), asc(sessionFeedback.id))
  return rows.map(toJson)
}

async function findOne(db: Db, id: number): Promise<SessionFeedback> {
  const [row] = await db
    .select(columns)
    .from(sessionFeedback)
    .leftJoin(users, eq(users.id, sessionFeedback.authorId))
    .where(eq(sessionFeedback.id, id))
  if (!row) notFound('Feedback not found')
  return toJson(row)
}

/** The exercise's name, if it's part of this session (prescribed or logged); otherwise 404. */
async function exerciseInSession(db: Db, sessionId: number, exerciseId: number) {
  const [[planned], [logged]] = await Promise.all([
    db
      .select({ name: exercises.name })
      .from(sessionExercises)
      .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
      .where(
        and(eq(sessionExercises.sessionId, sessionId), eq(sessionExercises.exerciseId, exerciseId)),
      )
      .limit(1),
    db
      .select({ name: exercises.name })
      .from(setLogs)
      .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
      .where(and(eq(setLogs.sessionId, sessionId), eq(setLogs.exerciseId, exerciseId)))
      .limit(1),
  ])
  const name = planned?.name ?? logged?.name
  if (!name) notFound('That exercise isn’t in this workout')
  return name
}

/**
 * A coach likes or comments on a session they're allowed to see (the caller checks that).
 * Liking twice keeps the first like. The client gets a push on their phone.
 */
export async function addFeedback(
  c: Context<AppEnv>,
  session: SessionRow,
  input: FeedbackInput,
): Promise<SessionFeedback> {
  const { db, user: me } = c.var
  await assertCanSend(c.env.SEND_LIMIT, me.id)
  const exerciseId = input.exerciseId ?? null
  const [exerciseName, [workout]] = await Promise.all([
    exerciseId === null ? Promise.resolve(null) : exerciseInSession(db, session.id, exerciseId),
    session.workoutId
      ? db.select({ name: workouts.name }).from(workouts).where(eq(workouts.id, session.workoutId))
      : Promise.resolve([] as Array<{ name: string }>),
  ])
  const isLike = input.kind === 'like'
  const [created] = await db
    .insert(sessionFeedback)
    .values({
      sessionId: session.id,
      exerciseId,
      authorId: me.id,
      kind: input.kind,
      body: isLike ? null : (input.body ?? null),
    })
    .onConflictDoNothing()
    .returning({ id: sessionFeedback.id })
  if (!created) {
    // Already liked: answer with the like that's there.
    const [existing] = await db
      .select({ id: sessionFeedback.id })
      .from(sessionFeedback)
      .where(
        and(
          eq(sessionFeedback.sessionId, session.id),
          eq(sessionFeedback.authorId, me.id),
          eq(sessionFeedback.kind, 'like'),
          exerciseId === null
            ? isNull(sessionFeedback.exerciseId)
            : eq(sessionFeedback.exerciseId, exerciseId),
        ),
      )
    if (!existing) notFound('Feedback not found')
    return findOne(db, existing.id)
  }
  const coach = me.name.split(' ')[0] || 'Your coach'
  const what = exerciseName ?? workout?.name ?? 'workout'
  await pushLater(c, [session.userId], {
    title: isLike ? `${coach} liked your ${what}` : `${coach} commented on your ${what}`,
    body: isLike ? 'Your coach saw your work. Keep it up!' : (input.body ?? '').slice(0, 140),
    url: `/progress?workout=${session.id}`,
    // One notification per workout: a newer like or comment replaces the last one.
    tag: `feedback-${session.id}`,
  })
  return findOne(db, created.id)
}

/** A coach takes back their own like or comment. Anyone else's, or one on another session: 404. */
export async function removeFeedback(db: Db, me: Me, sessionId: number, feedbackId: number) {
  const removed = await db
    .delete(sessionFeedback)
    .where(
      and(
        eq(sessionFeedback.id, feedbackId),
        eq(sessionFeedback.sessionId, sessionId),
        eq(sessionFeedback.authorId, me.id),
      ),
    )
    .returning({ id: sessionFeedback.id })
  if (removed.length === 0) notFound('Feedback not found')
}

/** The client's unread likes and comments, newest first, with what they were on. */
export async function unreadFeedback(db: Db, userId: number): Promise<FeedbackNews[]> {
  const rows = await db
    .select({
      ...columns,
      workoutName: workouts.name,
      exerciseName: exercises.name,
    })
    .from(sessionFeedback)
    .innerJoin(workoutSessions, eq(workoutSessions.id, sessionFeedback.sessionId))
    .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
    .leftJoin(exercises, eq(exercises.id, sessionFeedback.exerciseId))
    .leftJoin(users, eq(users.id, sessionFeedback.authorId))
    .where(and(eq(workoutSessions.userId, userId), isNull(sessionFeedback.readAt)))
    .orderBy(desc(sessionFeedback.createdAt), desc(sessionFeedback.id))
    .limit(50)
  return rows.map(toJson)
}

/** The client has seen these. Only ever their own; anything else is quietly skipped. */
export async function markFeedbackRead(db: Db, userId: number, ids: number[]) {
  const theirs = db
    .select({ id: workoutSessions.id })
    .from(workoutSessions)
    .where(eq(workoutSessions.userId, userId))
  const read = await db
    .update(sessionFeedback)
    .set({ readAt: new Date() })
    .where(
      and(
        inArray(sessionFeedback.id, ids),
        isNull(sessionFeedback.readAt),
        inArray(sessionFeedback.sessionId, theirs),
      ),
    )
    .returning({ id: sessionFeedback.id })
  return read.length
}
