// The workout library: exercises, workouts and programs either of you builds.
// Rows are archived (archived_at), never deleted, so history stays intact.
import {
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  GROUP_KINDS,
  MUSCLE_GROUPS,
  TRACKING_TYPES,
  WORKOUT_SECTIONS,
} from '@project180/shared'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { users } from './auth'
import { businesses } from './businesses'
import { createdAt, id, timestamp, updatedAt } from './columns'

const createdBy = () =>
  integer('created_by')
    .notNull()
    .references(() => users.id)

/** Set on a client's personal copy (made when a program is assigned); null = in the library. */
const clientId = () => integer('client_id').references(() => users.id, { onDelete: 'cascade' })

export const exercises = sqliteTable(
  'exercises',
  {
    id: id(),
    name: text('name').notNull(),
    muscleGroup: text('muscle_group', { enum: MUSCLE_GROUPS }).notNull(),
    category: text('category', { enum: EXERCISE_CATEGORIES }).notNull().default('strength'),
    equipment: text('equipment', { enum: EQUIPMENT }).notNull().default('other'),
    trackingType: text('tracking_type', { enum: TRACKING_TYPES }).notNull().default('weight_reps'),
    instructions: text('instructions'),
    // Other names and the muscles it works, for search: "hamstring curl, hamstrings".
    keywords: text('keywords'),
    videoUrl: text('video_url'),
    imageKey: text('image_key'),
    createdBy: createdBy(),
    // Each business has its own exercise library; only its staff and clients see these rows.
    businessId: integer('business_id').references(() => businesses.id),
    archivedAt: timestamp('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('exercises_created_by_idx').on(t.createdBy),
    index('exercises_business_name_idx').on(t.businessId, t.name),
  ],
)

/** A workout template, such as "Leg Day A". */
export const workouts = sqliteTable(
  'workouts',
  {
    id: id(),
    name: text('name').notNull(),
    description: text('description'),
    estimatedMinutes: integer('estimated_minutes'),
    createdBy: createdBy(),
    clientId: clientId(),
    // The library workout this copy was made from.
    sourceWorkoutId: integer('source_workout_id'),
    // Built by the person themselves in the app (Quick workout): never in a library or program.
    quick: integer('quick', { mode: 'boolean' }).notNull().default(false),
    archivedAt: timestamp('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('workouts_created_by_idx').on(t.createdBy),
    index('workouts_client_idx').on(t.clientId),
  ],
)

/** How a group of exercises (same superset_group number) is done: rounds, and for intervals the timing. */
export const workoutGroups = sqliteTable(
  'workout_groups',
  {
    id: id(),
    workoutId: integer('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    groupNumber: integer('group_number').notNull(),
    kind: text('kind', { enum: GROUP_KINDS }).notNull().default('superset'),
    rounds: integer('rounds').notNull().default(3),
    // Intervals (Tabata): seconds of work, then rest, per exercise.
    workSeconds: integer('work_seconds'),
    restSeconds: integer('rest_seconds'),
  },
  (t) => [uniqueIndex('workout_groups_slot_uq').on(t.workoutId, t.groupNumber)],
)

/** The exercises in a workout, in order, with their targets. */
export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    id: id(),
    workoutId: integer('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id),
    position: integer('position').notNull(),
    targetSets: integer('target_sets').notNull().default(3),
    targetRepsMin: integer('target_reps_min'),
    targetRepsMax: integer('target_reps_max'),
    // Reps for each set, e.g. [12, 10, 10, 8]; when set, targetSets is its length.
    targetRepsPerSet: text('target_reps_per_set', { mode: 'json' }).$type<number[]>(),
    // Done with bodyweight: no weight to log, even if the exercise usually has one.
    bodyweight: integer('bodyweight', { mode: 'boolean' }).notNull().default(false),
    targetSeconds: integer('target_seconds'),
    restSeconds: integer('rest_seconds').notNull().default(90),
    section: text('section', { enum: WORKOUT_SECTIONS }).notNull().default('main'),
    // Endurance targets: distance, pace (seconds per km) and heart-rate zone 1–5.
    targetDistanceM: real('target_distance_m'),
    targetPaceSeconds: integer('target_pace_seconds'),
    targetHrZone: integer('target_hr_zone'),
    // Same number = done together as a group (see workout_groups); null = on its own.
    supersetGroup: integer('superset_group'),
    notes: text('notes'),
  },
  (t) => [
    index('workout_exercises_workout_idx').on(t.workoutId, t.position),
    // "Where is this exercise used?" before archiving or deleting it.
    index('workout_exercises_exercise_idx').on(t.exerciseId),
  ],
)

/** A multi-week plan, such as "4-Week Strength". */
export const programs = sqliteTable(
  'programs',
  {
    id: id(),
    name: text('name').notNull(),
    description: text('description'),
    durationWeeks: integer('duration_weeks').notNull(),
    createdBy: createdBy(),
    clientId: clientId(),
    // The library program this copy was made from.
    sourceProgramId: integer('source_program_id'),
    // On a copy: when it was last made or brought up to date from the library program.
    syncedAt: timestamp('synced_at'),
    archivedAt: timestamp('archived_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('programs_created_by_idx').on(t.createdBy),
    index('programs_client_idx').on(t.clientId),
    // Clients' copies of a library program (updating them, "behind" badges).
    index('programs_source_idx').on(t.sourceProgramId),
  ],
)

/** One row per scheduled day. Days not listed are rest days. */
export const programDays = sqliteTable(
  'program_days',
  {
    id: id(),
    programId: integer('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    weekNumber: integer('week_number').notNull(),
    // 1–7, counted from the enrollment's start date.
    dayNumber: integer('day_number').notNull(),
    // Null = an explicit rest day.
    workoutId: integer('workout_id').references(() => workouts.id),
    checkinRequired: integer('checkin_required', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
  },
  (t) => [
    uniqueIndex('program_days_slot_uq').on(t.programId, t.weekNumber, t.dayNumber),
    // Which programs schedule a workout (library lists, purge checks).
    index('program_days_workout_idx').on(t.workoutId),
  ],
)

/** Cached YouTube search results per exercise (the API allows ~100 searches a day). */
export const videoSearches = sqliteTable('video_searches', {
  exerciseId: integer('exercise_id')
    .primaryKey()
    .references(() => exercises.id, { onDelete: 'cascade' }),
  // [{ videoId, title, channel, thumbnail }]
  results: text('results', { mode: 'json' })
    .notNull()
    .$type<Array<{ videoId: string; title: string; channel: string; thumbnail: string }>>(),
  fetchedAt: timestamp('fetched_at').notNull(),
})

/**
 * What a coach suggests when a client can't do an exercise (machine taken, no equipment).
 * Shown first in the app's swap sheet; clients can still search for anything else.
 */
export const exerciseAlternatives = sqliteTable(
  'exercise_alternatives',
  {
    exerciseId: integer('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    alternativeId: integer('alternative_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    createdBy: createdBy(),
  },
  (t) => [
    uniqueIndex('exercise_alternatives_pair_uq').on(t.exerciseId, t.alternativeId),
    index('exercise_alternatives_exercise_idx').on(t.exerciseId, t.position),
    // Deleting an exercise or a coach checks these.
    index('exercise_alternatives_alternative_idx').on(t.alternativeId),
    index('exercise_alternatives_created_by_idx').on(t.createdBy),
  ],
)
