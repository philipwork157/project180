import {
  type Db,
  enrollments,
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
  type PreviousSet,
  type SessionDetail,
  setLogInput,
  startSessionInput,
  type WorkoutExerciseItem,
  type WorkoutGroup,
} from '@project180/shared'
import { and, asc, desc, eq, inArray, max, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { insertMany, runAll } from '../batch'
import type { AppEnv } from '../env'
import { notFound, parseBody, parseId } from '../errors'
import { iso, visibleTo } from '../library'
import { requireUser } from '../middleware'
import { completedBy, sessionSummaries } from '../sessions'
import { loadWorkoutExercises, loadWorkoutGroups } from './workouts'

type SessionRow = typeof workoutSessions.$inferSelect

/** Your own sessions only. Anyone else's answers 404. */
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

async function previousSets(db: Db, user: Me, sessionId: number, exerciseIds: number[]) {
  const previous: Record<number, PreviousSet[]> = {}
  if (exerciseIds.length === 0) return previous
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
    .innerJoin(workoutSessions, eq(workoutSessions.id, setLogs.sessionId))
    .where(
      and(
        completedBy(user.id),
        ne(workoutSessions.id, sessionId),
        eq(setLogs.isWarmup, false),
        inArray(setLogs.exerciseId, exerciseIds),
      ),
    )
    .orderBy(desc(workoutSessions.startedAt), asc(setLogs.setNumber))
    .limit(1000)
  const sessionFor = new Map<number, number>()
  for (const { exerciseId, sessionId: sid, ...set } of rows) {
    const chosen = sessionFor.get(exerciseId) ?? sid
    sessionFor.set(exerciseId, chosen)
    if (chosen !== sid) continue
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
    })
    .from(sessionExercises)
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(eq(sessionExercises.sessionId, sessionId))
    .orderBy(asc(sessionExercises.position))
  if (rows.length === 0) return null
  const groups = new Map<number, WorkoutGroup>()
  const items = rows.map(
    ({ groupKind, groupRounds, groupWorkSeconds, groupRestSeconds, ...item }) => {
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

async function sessionDetail(db: Db, user: Me, row: SessionRow): Promise<SessionDetail> {
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
      user,
      row.id,
      items.map((i) => i.exerciseId),
    ),
  }
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
      return c.json({ session: await sessionDetail(db, user, existing) })
    }
    await assertCanDoWorkout(db, user, input.workoutId)
    if (input.enrollmentId) {
      const [own] = await db
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(and(eq(enrollments.id, input.enrollmentId), eq(enrollments.userId, user.id)))
      if (!own) notFound('Enrollment not found')
    }
    // One workout at a time: an unfinished one is closed when a new one starts.
    await db
      .update(workoutSessions)
      .set({ status: 'abandoned', endedAt: new Date() })
      .where(and(eq(workoutSessions.userId, user.id), eq(workoutSessions.status, 'in_progress')))
    const [row] = await db
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
      .returning()
    if (!row) throw new Error('Insert returned no row')
    await snapshotTargets(db, row.id, input.workoutId)
    return c.json({ session: await sessionDetail(db, user, row) }, 201)
  })
  .get('/active', async (c) => {
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
  .get('/:id', async (c) => {
    const row = await findOwn(c.var.db, c.var.user, parseId(c.req.param('id')))
    return c.json({ session: await sessionDetail(c.var.db, c.var.user, row) })
  })
  /** Save one set the moment it's ticked. Same clientUuid = update. */
  .put('/:id/sets', async (c) => {
    const { db, user } = c.var
    const session = await findOwn(db, user, parseId(c.req.param('id')))
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
    await db
      .insert(setLogs)
      .values({ ...values, clientUuid: input.clientUuid, sessionId: session.id })
      .onConflictDoUpdate({ target: setLogs.clientUuid, set: values })
    return c.json({ ok: true })
  })
  .delete('/:id/sets/:clientUuid', async (c) => {
    const session = await findOwn(c.var.db, c.var.user, parseId(c.req.param('id')))
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
    if (session.status !== 'in_progress')
      throw new HTTPException(409, { message: 'This workout is already finished' })
    await db.delete(setLogs).where(eq(setLogs.sessionId, session.id))
    const [row] = await db
      .update(workoutSessions)
      .set({ startedAt: new Date() })
      .where(eq(workoutSessions.id, session.id))
      .returning()
    if (!row) throw new Error('Update returned no row')
    return c.json({ session: await sessionDetail(db, user, row) })
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
    await db
      .update(workoutSessions)
      .set({
        status: input.status,
        endedAt,
        durationSeconds,
        feeling: input.feeling ?? null,
        energy: input.energy ?? null,
        notes: input.notes ?? null,
      })
      .where(eq(workoutSessions.id, session.id))

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
