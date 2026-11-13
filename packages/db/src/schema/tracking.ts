// What each person does: enrollments, sessions, sets and check-ins.
// client_uuid is made on the phone so rows logged offline sync without duplicates.
import {
  ENROLLMENT_STATUS,
  FEEDBACK_KINDS,
  GROUP_KINDS,
  SESSION_STATUS,
  WORKOUT_SECTIONS,
} from '@project180/shared'
import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './auth'
import { createdAt, id, timestamp, updatedAt } from './columns'
import { exercises, programDays, programs, workouts } from './library'

const userId = () =>
  integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })

/** A user doing a program from a start date. */
export const enrollments = sqliteTable(
  'enrollments',
  {
    id: id(),
    userId: userId(),
    programId: integer('program_id')
      .notNull()
      .references(() => programs.id),
    startDate: text('start_date').notNull(),
    status: text('status', { enum: ENROLLMENT_STATUS }).notNull().default('active'),
    assignedBy: integer('assigned_by').references(() => users.id),
    completedAt: timestamp('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('enrollments_user_idx').on(t.userId),
    // Copies and purges look enrollments up by program.
    index('enrollments_program_idx').on(t.programId),
    // At most one active program per person.
    uniqueIndex('enrollments_one_active_uq').on(t.userId).where(sql`${t.status} = 'active'`),
  ],
)

/** One workout actually done. */
export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: id(),
    clientUuid: text('client_uuid').notNull().unique(),
    userId: userId(),
    workoutId: integer('workout_id').references(() => workouts.id),
    enrollmentId: integer('enrollment_id').references(() => enrollments.id),
    programDayId: integer('program_day_id').references(() => programDays.id),
    scheduledDate: text('scheduled_date'),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at'),
    durationSeconds: integer('duration_seconds'),
    status: text('status', { enum: SESSION_STATUS }).notNull().default('in_progress'),
    // 1–5: how did you feel after?
    feeling: integer('feeling'),
    energy: integer('energy'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('workout_sessions_user_started_idx').on(t.userId, t.startedAt),
    // Every plan (Today screen, admin overview) reads finished sessions by enrollment.
    index('workout_sessions_enrollment_idx').on(t.enrollmentId, t.status),
    // Library lists and purges check whether a workout has history.
    index('workout_sessions_workout_idx').on(t.workoutId),
  ],
)

/**
 * What the workout asked for when this session started (sets, reps, rest, groups),
 * so history shows what was prescribed even if the workout is edited later.
 */
export const sessionExercises = sqliteTable(
  'session_exercises',
  {
    id: id(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id),
    position: integer('position').notNull(),
    targetSets: integer('target_sets').notNull(),
    targetRepsMin: integer('target_reps_min'),
    targetRepsMax: integer('target_reps_max'),
    targetRepsPerSet: text('target_reps_per_set', { mode: 'json' }).$type<number[]>(),
    bodyweight: integer('bodyweight', { mode: 'boolean' }).notNull().default(false),
    targetSeconds: integer('target_seconds'),
    restSeconds: integer('rest_seconds').notNull(),
    section: text('section', { enum: WORKOUT_SECTIONS }).notNull().default('main'),
    targetDistanceM: real('target_distance_m'),
    targetPaceSeconds: integer('target_pace_seconds'),
    targetHrZone: integer('target_hr_zone'),
    supersetGroup: integer('superset_group'),
    groupKind: text('group_kind', { enum: GROUP_KINDS }),
    groupRounds: integer('group_rounds'),
    groupWorkSeconds: integer('group_work_seconds'),
    groupRestSeconds: integer('group_rest_seconds'),
    notes: text('notes'),
    // Swapped during the session (machine taken, no equipment): what the workout asked for.
    originalExerciseId: integer('original_exercise_id').references(() => exercises.id),
    swappedAt: timestamp('swapped_at'),
  },
  (t) => [
    index('session_exercises_session_idx').on(t.sessionId, t.position),
    index('session_exercises_original_idx').on(t.originalExerciseId),
    index('session_exercises_exercise_idx').on(t.exerciseId),
  ],
)

/** Every set logged. */
export const setLogs = sqliteTable(
  'set_logs',
  {
    id: id(),
    clientUuid: text('client_uuid').notNull().unique(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id),
    setNumber: integer('set_number').notNull(),
    isWarmup: integer('is_warmup', { mode: 'boolean' }).notNull().default(false),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    durationSeconds: integer('duration_seconds'),
    distanceM: real('distance_m'),
    rpe: real('rpe'),
    completedAt: timestamp('completed_at'),
    notes: text('notes'),
  },
  (t) => [
    // Sets of a session, and of one exercise within it ("last time", records).
    index('set_logs_session_exercise_idx').on(t.sessionId, t.exerciseId),
    index('set_logs_exercise_idx').on(t.exerciseId),
  ],
)

/**
 * A coach's like or comment on a client's workout (exercise_id null) or one exercise in it.
 * The client sees it on that workout and in their notifications until they've read it.
 */
export const sessionFeedback = sqliteTable(
  'session_feedback',
  {
    id: id(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => workoutSessions.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id').references(() => exercises.id),
    // The coach who left it; kept (without a name) if their account is removed.
    authorId: integer('author_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind', { enum: FEEDBACK_KINDS }).notNull(),
    body: text('body'),
    createdAt: createdAt(),
    readAt: timestamp('read_at'),
  },
  (t) => [
    // A session's feedback, and the client's unread items (joined from their sessions).
    index('session_feedback_session_idx').on(t.sessionId, t.readAt),
    index('session_feedback_exercise_idx').on(t.exerciseId),
    index('session_feedback_author_idx').on(t.authorId),
    // One like per coach per exercise, and per whole workout.
    uniqueIndex('session_feedback_exercise_like_uq')
      .on(t.sessionId, t.authorId, t.exerciseId)
      .where(sql`${t.kind} = 'like' and ${t.exerciseId} is not null`),
    uniqueIndex('session_feedback_workout_like_uq')
      .on(t.sessionId, t.authorId)
      .where(sql`${t.kind} = 'like' and ${t.exerciseId} is null`),
  ],
)

export const bodyCheckins = sqliteTable(
  'body_checkins',
  {
    id: id(),
    clientUuid: text('client_uuid').notNull().unique(),
    userId: userId(),
    enrollmentId: integer('enrollment_id').references(() => enrollments.id),
    date: text('date').notNull(),
    weightKg: real('weight_kg'),
    bodyFatPct: real('body_fat_pct'),
    waistCm: real('waist_cm'),
    hipsCm: real('hips_cm'),
    chestCm: real('chest_cm'),
    armCm: real('arm_cm'),
    thighCm: real('thigh_cm'),
    photoKey: text('photo_key'),
    notes: text('notes'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('body_checkins_user_date_uq').on(t.userId, t.date),
    // Resetting or deleting a program removes its check-ins.
    index('body_checkins_enrollment_idx').on(t.enrollmentId),
  ],
)

/** Time spent with the app open on screen, per person per day (their local date). */
export const appActivity = sqliteTable(
  'app_activity',
  {
    userId: userId(),
    date: text('date').notNull(),
    seconds: integer('seconds').notNull().default(0),
  },
  (t) => [uniqueIndex('app_activity_user_date_uq').on(t.userId, t.date)],
)

/** Wrong-password counters for the sign-in limit, keyed by "email:…" or "ip:…". */
export const signInAttempts = sqliteTable('sign_in_attempts', {
  key: text('key').primaryKey(),
  failures: integer('failures').notNull().default(0),
  firstAt: timestamp('first_at').notNull(),
  lockedUntil: timestamp('locked_until'),
})

/**
 * A phone (or browser) that turned notifications on: where its push service is and the keys to
 * encrypt for it. One row per device; signing out on it, or the phone refusing a push, removes it.
 */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: id(),
    userId: userId(),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
)
