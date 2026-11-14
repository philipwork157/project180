import {
  type Db,
  enrollments,
  exerciseAlternatives,
  exercises,
  programDays,
  sessionExercises,
  setLogs,
  workoutSessions,
  workouts,
} from '@project180/db'
import {
  type FinishResult,
  finishSessionInput,
  type LoggedSet,
  type Me,
  mergeTargets,
  type PreviousSet,
  type SessionDetail,
  type SwapOptions,
  setLogInput,
  splitTargets,
  startSessionInput,
  swapExerciseInput,
  type WorkoutExerciseItem,
  type WorkoutGroup,
} from '@project180/shared'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  max,
  ne,
  sql,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { insertMany, runAll } from '../batch'
import type { AppEnv } from '../env'
import { conflict, notFound, parseBody, parseId } from '../errors'
import { loadFeedback } from '../feedback'
import { iso, visibleTo } from '../library'
import { requireUser } from '../middleware'
import {
  cancelWorkout,
  closeIdleWorkout,
  closeOpenWorkouts,
  completedBy,
  sessionSummaries,
} from '../sessions'
import { loadWorkoutExercises, loadWorkoutGroups } from './workouts'

type SessionRow = typeof workoutSessions.$inferSelect

/** Your own sessions only. Anyone else's answers 404. */
/** A finished (or abandoned) workout can't be changed: its sets, time and records are final. */
function assertInProgress(session: SessionRow) {
  if (session.status !== 'in_progress') conflict('This workout is already finished')
}

async function findOwn(db: Db, user: Me, id: number): Promise<SessionRow> {
  const [row] = await db
    .select()
    .from(workoutSessions)
    .where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, user.id)))
    .limit(1)
  if (!row) notFound('Workout session not found')
  return row
}

/** A workout you can see in the library, or one in the program you're enrolled in. */
async function assertCanDoWorkout(db: Db, user: Me, workoutId: number) {
  const [visible] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), visibleTo(workouts, user, 'any')))
  if (visible) return
  const [inPlan] = await db
    .select({ id: programDays.id })
    .from(programDays)
    .innerJoin(enrollments, eq(enrollments.programId, programDays.programId))
    .where(
      and(
        eq(programDays.workoutId, workoutId),
        eq(enrollments.userId, user.id),
        eq(enrollments.status, 'active'),
      ),
    )
    .limit(1)
  if (!inPlan) notFound('Workout not found')
}

/**
 * The enrollment (if given) is yours, and the program day (if given) is a day of that program,
 * or of your current one. Otherwise a session could mark a day "done" in someone else's plan.
 */
async function assertOwnPlanDay(
  db: Db,
  user: Me,
  enrollmentId: number | null,
  programDayId: number | null,
) {
  if (enrollmentId === null && programDayId === null) return
  const [enrollment] = await db
    .select({ id: enrollments.id, programId: enrollments.programId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, user.id),
        enrollmentId === null ? eq(enrollments.status, 'active') : eq(enrollments.id, enrollmentId),
      ),
    )
    .limit(1)
  if (!enrollment)
    notFound(enrollmentId === null ? 'Program day not found' : 'Enrollment not found')
  if (programDayId === null) return
  const [day] = await db
    .select({ id: programDays.id })
    .from(programDays)
    .where(and(eq(programDays.id, programDayId), eq(programDays.programId, enrollment.programId)))
  if (!day) notFound('Program day not found')
}

async function previousSets(db: Db, userId: number, sessionId: number, exerciseIds: number[]) {
  const previous: Record<number, PreviousSet[]> = {}
  const ids = [...new Set(exerciseIds)]
  if (ids.length === 0) return previous
  // 1. The latest finished session per exercise, worked out in SQL (one row per exercise; SQLite
  //    takes the session id from the row with the latest start).
  const latest = await db
    .select({
      exerciseId: setLogs.exerciseId,
      sessionId: setLogs.sessionId,
      at: max(workoutSessions.startedAt),
    })
    .from(setLogs)
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .where(
      and(
        completedBy(userId),
        ne(workoutSessions.id, sessionId),
        eq(setLogs.isWarmup, false),
        inArray(setLogs.exerciseId, ids),
      ),
    )
    .groupBy(setLogs.exerciseId)
  if (latest.length === 0) return previous
  // 2. Only those sessions' sets.
  const sessionOf = new Map(latest.map((r) => [r.exerciseId, r.sessionId]))
  const rows = await db
    .select({
      exerciseId: setLogs.exerciseId,
      sessionId: setLogs.sessionId,
      setNumber: setLogs.setNumber,
      weightKg: setLogs.weightKg,
      reps: setLogs.reps,
      durationSeconds: setLogs.durationSeconds,
      distanceM: setLogs.distanceM,
    })
    .from(setLogs)
    .where(
      and(
        inArray(setLogs.sessionId, [...new Set(sessionOf.values())]),
        inArray(setLogs.exerciseId, [...sessionOf.keys()]),
        eq(setLogs.isWarmup, false),
      ),
    )
    .orderBy(asc(setLogs.setNumber))
  for (const { exerciseId, sessionId: sid, ...set } of rows) {
    if (sessionOf.get(exerciseId) !== sid) continue
    previous[exerciseId] ??= []
    previous[exerciseId].push(set)
  }
  return previous
}

/**
 * Saves what the workout asks for right now (targets, rest, groups) with the session,
 * so its history always shows what was prescribed, even if the workout changes later.
 */
async function snapshotTargets(db: Db, sessionId: number, workoutId: number) {
  const items = (await loadWorkoutExercises(db, [workoutId])).get(workoutId) ?? []
  if (items.length === 0) return
  const groups = new Map(
    ((await loadWorkoutGroups(db, [workoutId])).get(workoutId) ?? []).map((g) => [
      g.groupNumber,
      g,
    ]),
  )
  await runAll(
    db,
    insertMany(
      db,
      sessionExercises,
      items.map((e, position) => {
        const g = e.supersetGroup !== null ? groups.get(e.supersetGroup) : undefined
        return {
          sessionId,
          exerciseId: e.exerciseId,
          position,
          targetSets: e.targetSets,
          targetRepsMin: e.targetRepsMin,
          targetRepsMax: e.targetRepsMax,
          targetRepsPerSet: e.targetRepsPerSet,
          bodyweight: e.bodyweight,
          targetSeconds: e.targetSeconds,
          restSeconds: e.restSeconds,
          section: e.section,
          targetDistanceM: e.targetDistanceM,
          targetPaceSeconds: e.targetPaceSeconds,
          targetHrZone: e.targetHrZone,
          supersetGroup: e.supersetGroup,
          groupKind: e.supersetGroup !== null ? (g?.kind ?? 'superset') : null,
          groupRounds: g?.rounds ?? null,
          groupWorkSeconds: g?.workSeconds ?? null,
          groupRestSeconds: g?.restSeconds ?? null,
          notes: e.notes,
        }
      }),
    ),
  )
}

/** The saved prescription for a session, or null for sessions from before it was saved. */
async function savedTargets(
  db: Db,
  sessionId: number,
): Promise<{ items: WorkoutExerciseItem[]; groups: WorkoutGroup[] } | null> {
  const original = alias(exercises, 'original')
  const rows = await db
    .select({
      exerciseId: sessionExercises.exerciseId,
      exerciseName: exercises.name,
      muscleGroup: exercises.muscleGroup,
      trackingType: exercises.trackingType,
      instructions: exercises.instructions,
      imageKey: exercises.imageKey,
      videoUrl: exercises.videoUrl,
      targetSets: sessionExercises.targetSets,
      targetRepsMin: sessionExercises.targetRepsMin,
      targetRepsMax: sessionExercises.targetRepsMax,
      targetRepsPerSet: sessionExercises.targetRepsPerSet,
      bodyweight: sessionExercises.bodyweight,
      targetSeconds: sessionExercises.targetSeconds,
      restSeconds: sessionExercises.restSeconds,
      section: sessionExercises.section,
      targetDistanceM: sessionExercises.targetDistanceM,
      targetPaceSeconds: sessionExercises.targetPaceSeconds,
      targetHrZone: sessionExercises.targetHrZone,
      supersetGroup: sessionExercises.supersetGroup,
      notes: sessionExercises.notes,
      groupKind: sessionExercises.groupKind,
      groupRounds: sessionExercises.groupRounds,
      groupWorkSeconds: sessionExercises.groupWorkSeconds,
      groupRestSeconds: sessionExercises.groupRestSeconds,
      originalId: sessionExercises.originalExerciseId,
      originalName: original.name,
    })
    .from(sessionExercises)
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .leftJoin(original, eq(original.id, sessionExercises.originalExerciseId))
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(asc(sessionExercises.position))
  if (rows.length === 0) return null
  const groups = new Map<number, WorkoutGroup>()
  const items = rows.map(
    ({
      groupKind,
      groupRounds,
      groupWorkSeconds,
      groupRestSeconds,
      originalId,
      originalName,
      ...rest
    }) => {
      const item: WorkoutExerciseItem = {
        ...rest,
        swappedFrom:
          originalId !== null ? { exerciseId: originalId, exerciseName: originalName ?? '' } : null,
      }
      if (item.supersetGroup !== null && !groups.has(item.supersetGroup)) {
        groups.set(item.supersetGroup, {
          groupNumber: item.supersetGroup,
          kind: groupKind ?? 'superset',
          rounds: groupRounds ?? item.targetSets,
          workSeconds: groupWorkSeconds,
          restSeconds: groupRestSeconds,
        })
      }
      return item
    },
  )
  return { items, groups: [...groups.values()] }
}

/** One session in full: what was prescribed, every set logged, and last time's sets. */
export async function sessionDetail(db: Db, row: SessionRow): Promise<SessionDetail> {
  // Independent reads, run together: this is what the workout screen waits for.
  const [[workout], saved, sets] = await Promise.all([
    row.workoutId
      ? db.select({ name: workouts.name }).from(workouts).where(eq(workouts.id, row.workoutId))
      : Promise.resolve([] as Array<{ name: string }>),
    savedTargets(db, row.id),
    db
      .select({
        clientUuid: setLogs.clientUuid,
        exerciseId: setLogs.exerciseId,
        exerciseName: exercises.name,
        setNumber: setLogs.setNumber,
        isWarmup: setLogs.isWarmup,
        weightKg: setLogs.weightKg,
        reps: setLogs.reps,
        durationSeconds: setLogs.durationSeconds,
        distanceM: setLogs.distanceM,
        rpe: setLogs.rpe,
      })
      .from(setLogs)
      .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
      .where(eq(setLogs.sessionId, row.id))
      .orderBy(asc(setLogs.completedAt), asc(setLogs.setNumber)) as Promise<LoggedSet[]>,
  ])
  // Sessions from before targets were saved: read the workout as it is now.
  const [items, groups] = saved
    ? [saved.items, saved.groups]
    : row.workoutId
      ? await Promise.all([
          loadWorkoutExercises(db, [row.workoutId]).then((m) => m.get(row.workoutId ?? 0) ?? []),
          loadWorkoutGroups(db, [row.workoutId]).then((m) => m.get(row.workoutId ?? 0) ?? []),
        ])
      : [[], []]
  return {
    id: row.id,
    clientUuid: row.clientUuid,
    status: row.status,
    workoutId: row.workoutId,
    workoutName: workout?.name ?? null,
    programDayId: row.programDayId,
    scheduledDate: row.scheduledDate,
    startedAt: row.startedAt.toISOString(),
    endedAt: iso(row.endedAt),
    durationSeconds: row.durationSeconds,
    feeling: row.feeling,
    notes: row.notes,
    exercises: items,
    groups,
    sets,
    previous: await previousSets(
      db,
      row.userId,
      row.id,
      items.map((i) => i.exerciseId),
    ),
  }
}

/** Everything the app's swap sheet needs: every exercise in use, the coach's picks and your past swaps. */
async function swapOptions(db: Db, user: Me): Promise<SwapOptions> {
  const alt = alias(exercises, 'alt')
  const [list, picks, past] = await Promise.all([
    db
      .select({
        id: exercises.id,
        name: exercises.name,
        muscleGroup: exercises.muscleGroup,
        equipment: exercises.equipment,
        trackingType: exercises.trackingType,
        keywords: exercises.keywords,
        imageKey: exercises.imageKey,
      })
      .from(exercises)
      .where(isNull(exercises.archivedAt))
      .orderBy(asc(exercises.name)),
    db
      .select({
        exerciseId: exerciseAlternatives.exerciseId,
        alternativeId: exerciseAlternatives.alternativeId,
      })
      .from(exerciseAlternatives)
      .innerJoin(alt, eq(alt.id, exerciseAlternatives.alternativeId))
      .where(isNull(alt.archivedAt))
      .orderBy(asc(exerciseAlternatives.exerciseId), asc(exerciseAlternatives.position)),
    db
      .select({
        originalId: sessionExercises.originalExerciseId,
        exerciseId: sessionExercises.exerciseId,
        last: max(sessionExercises.swappedAt),
      })
      .from(sessionExercises)
      .innerJoin(workoutSessions, eq(workoutSessions.id, sessionExercises.sessionId))
      .where(
        and(eq(workoutSessions.userId, user.id), isNotNull(sessionExercises.originalExerciseId)),
      )
      .groupBy(sessionExercises.originalExerciseId, sessionExercises.exerciseId)
      .orderBy(desc(max(sessionExercises.swappedAt)))
      .limit(500),
  ])
  const coach: SwapOptions['coach'] = {}
  for (const p of picks) coach[p.exerciseId] = [...(coach[p.exerciseId] ?? []), p.alternativeId]
  const mine: SwapOptions['mine'] = {}
  for (const p of past)
    if (p.originalId !== null) mine[p.originalId] = [...(mine[p.originalId] ?? []), p.exerciseId]
  return { exercises: list, coach, mine }
}

const targetsOf = (r: typeof sessionExercises.$inferSelect) => ({
  targetSets: r.targetSets,
  targetRepsMin: r.targetRepsMin,
  targetRepsMax: r.targetRepsMax,
  targetRepsPerSet: r.targetRepsPerSet,
})

/**
 * Swap one exercise in a workout that's in progress. Sets already logged stay with the exercise
 * they were done on; the sets still to do move to the replacement. Swapping back undoes it.
 */
async function swapExercise(
  db: Db,
  session: SessionRow,
  input: { exerciseId: number; replacementId: number },
) {
  assertInProgress(session)
  const rows = await db
    .select()
    .from(sessionExercises)
    .where(eq(sessionExercises.sessionId, session.id))
    .orderBy(asc(sessionExercises.position))
  const slot = rows.find((r) => r.exerciseId === input.exerciseId)
  if (!slot) notFound('That exercise isn’t in this workout')
  if (input.replacementId === slot.exerciseId) return
  const [[replacement], [logged]] = await Promise.all([
    db
      .select({ id: exercises.id, equipment: exercises.equipment })
      .from(exercises)
      .where(and(eq(exercises.id, input.replacementId), isNull(exercises.archivedAt))),
    db
      .select({ n: count() })
      .from(setLogs)
      .where(and(eq(setLogs.sessionId, session.id), eq(setLogs.exerciseId, slot.exerciseId))),
  ])
  if (!replacement) notFound('Exercise not found')
  const done = logged?.n ?? 0
  const backToOriginal = slot.originalExerciseId === replacement.id
  // Reps only stays reps only when the replacement is a bodyweight move too.
  const bodyweight = slot.bodyweight && replacement.equipment === 'bodyweight'
  const twin = rows.find((r) => r.exerciseId === replacement.id)

  if (twin) {
    // The only way back to an exercise already in the workout: undoing a mid-exercise swap.
    if (!backToOriginal || done > 0) conflict('That exercise is already in this workout')
    const merged = mergeTargets(targetsOf(twin), targetsOf(slot))
    await db.batch([
      db.update(sessionExercises).set(merged).where(eq(sessionExercises.id, twin.id)),
      db.delete(sessionExercises).where(eq(sessionExercises.id, slot.id)),
    ])
    return
  }

  if (done === 0) {
    // Nothing logged yet: the replacement simply takes its place.
    await db
      .update(sessionExercises)
      .set(
        backToOriginal
          ? { exerciseId: replacement.id, originalExerciseId: null, swappedAt: null }
          : {
              exerciseId: replacement.id,
              originalExerciseId: slot.originalExerciseId ?? slot.exerciseId,
              swappedAt: new Date(),
              bodyweight,
            },
      )
      .where(eq(sessionExercises.id, slot.id))
    return
  }

  // Some sets done: they stay where they are, and the rest go to the replacement right after it.
  const { done: kept, rest } = splitTargets(targetsOf(slot), done)
  const { id: _id, ...copy } = slot
  await db.batch([
    db.update(sessionExercises).set(kept).where(eq(sessionExercises.id, slot.id)),
    db
      .update(sessionExercises)
      .set({ position: sql`${sessionExercises.position} + 1` })
      .where(
        and(
          eq(sessionExercises.sessionId, session.id),
          gt(sessionExercises.position, slot.position),
        ),
      ),
    db.insert(sessionExercises).values({
      ...copy,
      ...rest,
      exerciseId: replacement.id,
      position: slot.position + 1,
      bodyweight,
      originalExerciseId: slot.exerciseId,
      swappedAt: new Date(),
    }),
  ])
}

export const sessionRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get('/', async (c) => {
    const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 100)
    return c.json({ sessions: await sessionSummaries(c.var.db, completedBy(c.var.user.id), limit) })
  })
  /** Start a workout. Sending the same clientUuid again returns the same session. */
  .post('/', async (c) => {
    const { db, user } = c.var
    const input = await parseBody(c.req.raw, startSessionInput)
    const [existing] = await db
      .select()
      .from(workoutSessions)
      .where(eq(workoutSessions.clientUuid, input.clientUuid))
    if (existing) {
      if (existing.userId !== user.id)
        throw new HTTPException(409, { message: 'Session id in use' })
      return c.json({ session: await sessionDetail(db, existing) })
    }
    await Promise.all([
      assertCanDoWorkout(db, user, input.workoutId),
      assertOwnPlanDay(db, user, input.enrollmentId ?? null, input.programDayId ?? null),
    ])
    // One workout at a time: an unfinished one is closed when a new one starts. Both in one
    // batch (all or nothing), and the database allows only one in progress per person.
    let row: SessionRow | undefined
    try {
      // The open one is stopped early if anything was logged in it, otherwise cancelled.
      const [closeStopped, closeCancelled] = closeOpenWorkouts(
        db,
        eq(workoutSessions.userId, user.id),
        new Date(),
      )
      const [, , inserted] = await db.batch([
        closeStopped,
        closeCancelled,
        db
          .insert(workoutSessions)
          .values({
            clientUuid: input.clientUuid,
            userId: user.id,
            workoutId: input.workoutId,
            enrollmentId: input.enrollmentId ?? null,
            programDayId: input.programDayId ?? null,
            scheduledDate: input.scheduledDate ?? null,
            startedAt: new Date(),
          })
          .returning(),
      ])
      row = inserted[0]
    } catch (err) {
      // The same start sent twice at once: the first one won, so answer with it.
      const [same] = await db
        .select()
        .from(workoutSessions)
        .where(eq(workoutSessions.clientUuid, input.clientUuid))
      if (same?.userId === user.id) return c.json({ session: await sessionDetail(db, same) })
      throw err
    }
    if (!row) throw new Error('Insert returned no row')
    await snapshotTargets(db, row.id, input.workoutId)
    return c.json({ session: await sessionDetail(db, row) }, 201)
  })
  .get('/active', async (c) => {
    // A workout left idle for hours is closed first, so "Resume" never shows a stale one.
    await closeIdleWorkout(c.var.db, c.var.user.id)
    const [row] = await c.var.db
      .select({
        id: workoutSessions.id,
        workoutName: workouts.name,
        startedAt: workoutSessions.startedAt,
      })
      .from(workoutSessions)
      .leftJoin(workouts, eq(workouts.id, workoutSessions.workoutId))
      .where(
        and(eq(workoutSessions.userId, c.var.user.id), eq(workoutSessions.status, 'in_progress')),
      )
      .orderBy(desc(workoutSessions.startedAt))
      .limit(1)
    return c.json({ session: row ?? null })
  })
  /** For the swap sheet: loaded when a workout opens so it works with poor signal. */
  .get('/swap-options', async (c) => c.json(await swapOptions(c.var.db, c.var.user)))
  .get('/:id', async (c) => {
    const row = await findOwn(c.var.db, c.var.user, parseId(c.req.param('id')))
    return c.json({ session: await sessionDetail(c.var.db, row) })
  })
  /** Your coach's likes and comments on this workout. */
  .get('/:id/feedback', async (c) => {
    const row = await findOwn(c.var.db, c.var.user, parseId(c.req.param('id')))
    return c.json({ feedback: await loadFeedback(c.var.db, row.id) })
  })
  /** Save one set the moment it's ticked. Same clientUuid = update. */
  .put('/:id/sets', async (c) => {
    const { db, user } = c.var
    const session = await findOwn(db, user, parseId(c.req.param('id')))
    assertInProgress(session)
    const input = await parseBody(c.req.raw, setLogInput)
    const [clash] = await db
      .select({ sessionId: setLogs.sessionId })
      .from(setLogs)
      .where(eq(setLogs.clientUuid, input.clientUuid))
    if (clash && clash.sessionId !== session.id)
      throw new HTTPException(409, { message: 'Set id in use' })
    const [exercise] = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.id, input.exerciseId))
    if (!exercise) notFound('Exercise not found')
    const values = {
      exerciseId: input.exerciseId,
      setNumber: input.setNumber,
      isWarmup: input.isWarmup,
      weightKg: input.weightKg ?? null,
      reps: input.reps ?? null,
      durationSeconds: input.durationSeconds ?? null,
      distanceM: input.distanceM ?? null,
      rpe: input.rpe ?? null,
      completedAt: new Date(),
    }
    // Already saved under another id (the phone reloaded before this set went through): one row
    // per set, so the newest numbers update that row and it takes this id.
    const [slot] = await db
      .select({ id: setLogs.id, clientUuid: setLogs.clientUuid })
      .from(setLogs)
      .where(
        and(
          eq(setLogs.sessionId, session.id),
          eq(setLogs.exerciseId, input.exerciseId),
          eq(setLogs.setNumber, input.setNumber),
          eq(setLogs.isWarmup, input.isWarmup),
        ),
      )
    if (slot && slot.clientUuid !== input.clientUuid) {
      await db.batch([
        // This id elsewhere in the workout (a set it used to be): it moves here.
        db
          .delete(setLogs)
          .where(and(eq(setLogs.clientUuid, input.clientUuid), ne(setLogs.id, slot.id))),
        db
          .update(setLogs)
          .set({ ...values, clientUuid: input.clientUuid })
          .where(eq(setLogs.id, slot.id)),
      ])
      return c.json({ ok: true })
    }
    await db
      .insert(setLogs)
      .values({ ...values, clientUuid: input.clientUuid, sessionId: session.id })
      .onConflictDoUpdate({ target: setLogs.clientUuid, set: values })
    return c.json({ ok: true })
  })
  .delete('/:id/sets/:clientUuid', async (c) => {
    const session = await findOwn(c.var.db, c.var.user, parseId(c.req.param('id')))
    assertInProgress(session)
    await c.var.db
      .delete(setLogs)
      .where(
        and(eq(setLogs.sessionId, session.id), eq(setLogs.clientUuid, c.req.param('clientUuid'))),
      )
    return c.body(null, 204)
  })
  /** Start over: drop every logged set and put the clock back to zero. */
  .post('/:id/restart', async (c) => {
    const { db, user } = c.var
    const session = await findOwn(db, user, parseId(c.req.param('id')))
    assertInProgress(session)
    await db.delete(setLogs).where(eq(setLogs.sessionId, session.id))
    const [row] = await db
      .update(workoutSessions)
      .set({ startedAt: new Date() })
      .where(eq(workoutSessions.id, session.id))
      .returning()
    if (!row) throw new Error('Update returned no row')
    return c.json({ session: await sessionDetail(db, row) })
  })
  /** Swap an exercise (machine taken, no equipment). Answers the updated session. */
  .post('/:id/swap', async (c) => {
    const { db, user } = c.var
    const session = await findOwn(db, user, parseId(c.req.param('id')))
    const input = await parseBody(c.req.raw, swapExerciseInput)
    await swapExercise(db, session, input)
    return c.json({ session: await sessionDetail(db, session) })
  })
  /** Started by accident: close it without counting it. The coach still sees it, as cancelled. */
  .post('/:id/cancel', async (c) => {
    const session = await findOwn(c.var.db, c.var.user, parseId(c.req.param('id')))
    await cancelWorkout(c.var.db, session)
    return c.body(null, 204)
  })
  .post('/:id/finish', async (c) => {
    const { db, user } = c.var
    const session = await findOwn(db, user, parseId(c.req.param('id')))
    const input = await parseBody(c.req.raw, finishSessionInput)
    const endedAt = new Date()
    const durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - session.startedAt.getTime()) / 1000),
    )
    // Only an unfinished workout can be finished (checked in the update, so two at once can't).
    const [updated] = await db
      .update(workoutSessions)
      .set({
        status: input.status,
        endedAt,
        durationSeconds,
        feeling: input.feeling ?? null,
        energy: input.energy ?? null,
        notes: input.notes ?? null,
      })
      .where(and(eq(workoutSessions.id, session.id), eq(workoutSessions.status, 'in_progress')))
      .returning({ id: workoutSessions.id })
    if (!updated) {
      // A retried "finish" (the answer got lost on bad signal) gets the same answer again;
      // anything else on a finished workout is refused, and nothing about it changes.
      const [now] = await db
        .select({ status: workoutSessions.status })
        .from(workoutSessions)
        .where(eq(workoutSessions.id, session.id))
      if (!(now?.status === 'completed' && input.status === 'completed'))
        conflict('This workout is already finished')
    }

    // New personal records: heavier than any earlier completed session.
    const records: FinishResult['records'] = []
    if (input.status === 'completed') {
      const mine = await db
        .select({
          exerciseId: setLogs.exerciseId,
          name: exercises.name,
          best: max(setLogs.weightKg),
        })
        .from(setLogs)
        .innerJoin(exercises, eq(exercises.id, setLogs.exerciseId))
        .where(and(eq(setLogs.sessionId, session.id), eq(setLogs.isWarmup, false)))
        .groupBy(setLogs.exerciseId)
      const ids = mine.map((m) => m.exerciseId)
      const before = ids.length
        ? await db
            .select({ exerciseId: setLogs.exerciseId, best: max(setLogs.weightKg) })
            .from(setLogs)
            .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
            .where(
              and(
                completedBy(user.id),
                ne(workoutSessions.id, session.id),
                eq(setLogs.isWarmup, false),
                inArray(setLogs.exerciseId, ids),
              ),
            )
            .groupBy(setLogs.exerciseId)
        : []
      const prior = new Map(before.map((b) => [b.exerciseId, b.best ?? 0]))
      for (const m of mine) {
        const was = prior.get(m.exerciseId)
        if (m.best && was !== undefined && m.best > was) {
          records.push({ exerciseId: m.exerciseId, exerciseName: m.name, weightKg: m.best })
        }
      }
    }
    const [summary] = await sessionSummaries(db, eq(workoutSessions.id, session.id), 1)
    if (!summary) throw new Error('Session vanished')
    const result: FinishResult = { session: summary, records }
    return c.json(result)
  })
