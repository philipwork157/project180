import { z } from 'zod'
import {
  ACTIVITY_LEVELS,
  BODY_GOALS,
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  EXPERIENCE_LEVELS,
  FEEDBACK_KINDS,
  GOALS,
  GROUP_KINDS,
  MUSCLE_GROUPS,
  SEXES,
  TRACKING_TYPES,
  TRAINING_PLACES,
  WORKOUT_SECTIONS,
} from './enums'
import { MAX_ALTERNATIVES } from './swaps'

const name = z.string().trim().min(1, 'Required').max(80)
const password = z.string().min(8, 'At least 8 characters').max(128)
// Trim and lower-case first, then check it's an email (Zod checks before a transform runs).
const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'))

/** True for a date that exists ("2026-02-29" is not one). */
function isRealDate(value: string) {
  const [y = 0, m = 0, d = 0] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** A calendar date as YYYY-MM-DD, and a real one (not "2026-13-45"). */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(isRealDate, 'That date doesn’t exist')
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null)

/** What a coach knows about a client: contact, body basics and goals. Everything is optional. */
export const clientProfileInput = z.object({
  phone: optionalText(30),
  birthDate: isoDate.nullish(),
  sex: z.enum(SEXES).nullish(),
  heightCm: z.number().min(80).max(250).nullish(),
  goalWeightKg: z.number().min(25).max(400).nullish(),
  /** Left out = unchanged (the phone app never sends it; only their coach sets it). */
  activityLevel: z.enum(ACTIVITY_LEVELS).nullish(),
  mainGoal: z.enum(GOALS).nullish(),
  /** Left out = unchanged (with a coach, only their coach sets it). */
  bodyGoal: z.enum(BODY_GOALS).nullish(),
  focusAreas: z.array(z.enum(GOALS)).max(GOALS.length).default([]),
  places: z.array(z.enum(TRAINING_PLACES)).max(TRAINING_PLACES.length).default([]),
  experience: z.enum(EXPERIENCE_LEVELS).nullish(),
  daysPerWeek: z.number().int().min(1).max(7).nullish(),
  targetEvent: optionalText(120),
  targetEventDate: isoDate.nullish(),
  notes: optionalText(2000),
})
export type ClientProfileInput = z.input<typeof clientProfileInput>

/** Admin creates another account (the new-client wizard sends all of it in one go). */
export const createUserInput = z.object({
  name,
  email,
  password,
  // Never 'platform': the platform admin is only ever made with `bun run admin:create`.
  role: z.enum(['owner', 'admin', 'member']).default('member'),
  /** Owners can pick the coach; a coach's new clients are always their own. */
  coachId: z.number().int().positive().nullish(),
  profile: clientProfileInput.optional(),
  /** Today's weight: saved as their first weigh-in. */
  currentWeightKg: z.number().min(25).max(400).nullish(),
  /** Assign a program straight away. */
  program: z.object({ programId: z.number().int().positive(), startDate: isoDate }).nullish(),
  /** Email them their sign-in details. */
  sendWelcome: z.boolean().default(false),
  /** Their first check-in (clients of the coach adding them). */
  checkIn: z
    .object({
      dueDate: isoDate,
      repeatWeeks: z.union([z.literal(1), z.literal(2), z.literal(4)]).nullable(),
    })
    .nullish(),
})

export const assignCoachInput = z.object({ coachId: z.number().int().positive() })
export type CreateUserInput = z.input<typeof createUserInput>

export const resetPasswordInput = z.object({ password, sendEmail: z.boolean().default(false) })

/** Block someone's access to the apps (true) or let them back in (false). */
export const blockAccessInput = z.object({ blocked: z.boolean() })

/** First sign-in after a temporary password: they choose their own. */
export const choosePasswordInput = z.object({ password })

/** Seconds the app was open on screen since the last beat (the app sends one a minute). */
export const heartbeatInput = z.object({ seconds: z.number().int().min(1).max(120) })

/** A phone turning notifications on: what the browser's `PushSubscription.toJSON()` gives. */
export const pushSubscriptionInput = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({
    p256dh: z.string().min(80).max(120),
    auth: z.string().min(16).max(40),
  }),
})
export type PushSubscriptionInput = z.input<typeof pushSubscriptionInput>
export const pushUnsubscribeInput = z.object({ endpoint: z.string().max(1000) })

/** Your own details. Only the name: the time zone (Africa/Johannesburg) and kg never change. */
export const updateProfileInput = z.object({ name }).partial()
export type UpdateProfileInput = z.infer<typeof updateProfileInput>

const exerciseFields = {
  name,
  muscleGroup: z.enum(MUSCLE_GROUPS),
  category: z.enum(EXERCISE_CATEGORIES),
  equipment: z.enum(EQUIPMENT),
  trackingType: z.enum(TRACKING_TYPES),
  instructions: z.string().trim().max(2000).nullish(),
  /** Other names and muscles, for search: "hamstring curl, hamstrings". */
  keywords: z.string().trim().max(300).nullish(),
  // Coach-chosen video: an https YouTube or Vimeo link only (we link, never re-host).
  videoUrl: z
    .url({
      protocol: /^https$/,
      hostname: /^((www|m)\.)?(youtube\.com|youtu\.be)$|^((www|player)\.)?vimeo\.com$/,
      error: 'Use a YouTube or Vimeo link',
    })
    .max(500)
    .nullish(),
}

export const exerciseInput = z.object({
  ...exerciseFields,
  equipment: exerciseFields.equipment.default('other'),
  category: exerciseFields.category.default('strength'),
  trackingType: exerciseFields.trackingType.default('weight_reps'),
})
export type ExerciseInput = z.input<typeof exerciseInput>

/** Partial update: no defaults, so omitted fields stay as they are. */
export const exerciseUpdate = z.object(exerciseFields).partial()
export type ExerciseUpdate = z.input<typeof exerciseUpdate>

const id = z.number().int().positive()
const optionalInt = (max: number) => z.number().int().min(0).max(max).nullish()
const isoDay = isoDate

export const workoutExerciseInput = z
  .object({
    exerciseId: id,
    targetSets: z.number().int().min(1).max(20).default(3),
    targetRepsMin: optionalInt(200),
    targetRepsMax: optionalInt(200),
    /** Reps for each set instead of a range: [12, 10, 10, 8]. Sets the number of sets too. */
    targetRepsPerSet: z.array(z.number().int().min(1).max(200)).min(1).max(20).nullish(),
    /** Bodyweight: log reps only, no weight. */
    bodyweight: z.boolean().default(false),
    targetSeconds: optionalInt(7200),
    restSeconds: z.number().int().min(0).max(900).default(90),
    section: z.enum(WORKOUT_SECTIONS).default('main'),
    /** Endurance: distance in metres, pace in seconds per km, heart-rate zone 1–5. */
    targetDistanceM: z.number().min(0).max(1_000_000).nullish(),
    targetPaceSeconds: optionalInt(3600),
    targetHrZone: z.number().int().min(1).max(5).nullish(),
    supersetGroup: optionalInt(50),
    notes: z.string().trim().max(500).nullish(),
  })
  // Per-set reps decide the set count, and the range becomes their lowest and highest.
  .transform((e) =>
    e.targetRepsPerSet?.length
      ? {
          ...e,
          targetSets: e.targetRepsPerSet.length,
          targetRepsMin: Math.min(...e.targetRepsPerSet),
          targetRepsMax: Math.max(...e.targetRepsPerSet),
        }
      : { ...e, targetRepsPerSet: null },
  )
export type WorkoutExerciseInput = z.input<typeof workoutExerciseInput>

/** How a group of exercises (same supersetGroup number) is done. */
export const workoutGroupInput = z.object({
  groupNumber: z.number().int().min(1).max(50),
  kind: z.enum(GROUP_KINDS).default('superset'),
  rounds: z.number().int().min(1).max(50).default(3),
  workSeconds: z.number().int().min(5).max(3600).nullish(),
  restSeconds: z.number().int().min(0).max(3600).nullish(),
})
export type WorkoutGroupInput = z.input<typeof workoutGroupInput>

/** Keep only groups that exercises actually use, once each. */
function keepUsedGroups<
  W extends {
    exercises: Array<{ supersetGroup?: number | null }>
    groups: Array<{ groupNumber: number }>
  },
>(w: W): W {
  const used = new Set(
    w.exercises.map((e) => e.supersetGroup).filter((g): g is number => g != null),
  )
  const seen = new Set<number>()
  return {
    ...w,
    groups: w.groups.filter(
      (g) => used.has(g.groupNumber) && !seen.has(g.groupNumber) && seen.add(g.groupNumber),
    ),
  }
}

/** Create or replace a workout. The exercises array order is the workout order. */
export const workoutInput = z
  .object({
    name,
    description: z.string().trim().max(1000).nullish(),
    estimatedMinutes: optionalInt(600),
    exercises: z.array(workoutExerciseInput).max(40).default([]),
    groups: z.array(workoutGroupInput).max(20).default([]),
  })
  .transform(keepUsedGroups)
export type WorkoutInput = z.input<typeof workoutInput>

/**
 * Quick workout: someone builds their own and starts it at once. The clientUuid is the new
 * session's, so a retried start returns the same workout. sourceWorkoutId = built from one.
 */
export const quickWorkoutInput = z
  .object({
    clientUuid: z.uuid(),
    name,
    sourceWorkoutId: id.nullish(),
    exercises: z.array(workoutExerciseInput).min(1, 'Add at least one exercise').max(40),
    groups: z.array(workoutGroupInput).max(20).default([]),
  })
  .transform(keepUsedGroups)
export type QuickWorkoutInput = z.input<typeof quickWorkoutInput>

/** A coach lets a client build their own quick workouts (or stops them). */
export const quickWorkoutsAccessInput = z.object({ enabled: z.boolean() })

export const programDayInput = z.object({
  weekNumber: z.number().int().min(1).max(52),
  dayNumber: z.number().int().min(1).max(7),
  workoutId: id.nullable(),
  checkinRequired: z.boolean().default(false),
  notes: z.string().trim().max(500).nullish(),
})
export type ProgramDayInput = z.input<typeof programDayInput>

/** Create or replace a program. Days not listed are rest days. */
export const programInput = z.object({
  name,
  description: z.string().trim().max(1000).nullish(),
  durationWeeks: z.number().int().min(1).max(52),
  days: z
    .array(programDayInput)
    .max(52 * 7)
    .default([]),
})
export type ProgramInput = z.input<typeof programInput>

export const assignInput = z.object({
  userId: id,
  programId: id,
  startDate: isoDay,
  /**
   * Already on this program? `update` brings their copy up to date and keeps their start date
   * and progress; `restart` gives them a fresh copy from `startDate`.
   */
  mode: z.enum(['restart', 'update']).default('restart'),
})
export type AssignInput = z.input<typeof assignInput>

/** Bring these people's copies of a library program up to date with it. */
export const syncCopiesInput = z.object({
  enrollmentIds: z.array(id).min(1).max(200),
})

export const startSessionInput = z.object({
  clientUuid: z.uuid(),
  workoutId: id,
  enrollmentId: id.nullish(),
  programDayId: id.nullish(),
  scheduledDate: isoDay.nullish(),
})
export type StartSessionInput = z.infer<typeof startSessionInput>

/** One set, saved the moment it's ticked. Sending the same clientUuid again updates it. */
export const setLogInput = z.object({
  clientUuid: z.uuid(),
  exerciseId: id,
  setNumber: z.number().int().min(1).max(50),
  isWarmup: z.boolean().default(false),
  weightKg: z.number().min(0).max(1000).nullish(),
  reps: z.number().int().min(0).max(1000).nullish(),
  durationSeconds: optionalInt(36000),
  distanceM: z.number().min(0).max(1_000_000).nullish(),
  rpe: z.number().min(1).max(10).nullish(),
})
export type SetLogInput = z.input<typeof setLogInput>

export const finishSessionInput = z.object({
  status: z.enum(['completed', 'abandoned']).default('completed'),
  feeling: z.number().int().min(1).max(5).nullish(),
  energy: z.number().int().min(1).max(5).nullish(),
  notes: z.string().trim().max(2000).nullish(),
})
export type FinishSessionInput = z.input<typeof finishSessionInput>

/** Swap an exercise in a workout that's in progress. */
export const swapExerciseInput = z.object({
  /** The exercise as it is in the session now. */
  exerciseId: z.number().int().positive(),
  replacementId: z.number().int().positive(),
})
export type SwapExerciseInput = z.input<typeof swapExerciseInput>

/** A coach likes or comments on a client's workout, or one exercise in it. */
export const feedbackInput = z
  .object({
    /** Null or left out: the whole workout. */
    exerciseId: z.number().int().positive().nullish(),
    kind: z.enum(FEEDBACK_KINDS),
    body: z.string().trim().max(1000).nullish(),
  })
  .refine((f) => f.kind === 'like' || !!f.body, {
    message: 'Write a comment first',
    path: ['body'],
  })
export type FeedbackInput = z.input<typeof feedbackInput>

/** Mark these feedback items as read (the client opened them). */
export const feedbackReadInput = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(90),
})

/** The People page: which tab, a search, the order and the page. */
export const peopleQueryInput = z.object({
  // me = just yourself (pinned above your clients, so you can manage your own program).
  view: z.enum(['me', 'mine', 'clients', 'team']).default('mine'),
  // D1 refuses LIKE patterns over 50 bytes.
  q: z.string().trim().max(40).default(''),
  sort: z.enum(['added', 'seen', 'name']).default('added'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
})

/** One chat message. clientUuid makes a retried send safe. */
export const messageInput = z.object({
  clientUuid: z.string().uuid(),
  body: z.string().trim().min(1, 'Write a message first').max(2000),
})
export type MessageInput = z.input<typeof messageInput>

/** Read up to (and including) this message. */
export const messageReadInput = z.object({
  upTo: z.number().int().positive(),
})

/** A coach's suggested swaps for one exercise, in order. */
export const exerciseAlternativesInput = z.object({
  alternativeIds: z
    .array(z.number().int().positive())
    .max(MAX_ALTERNATIVES, `At most ${MAX_ALTERNATIVES} alternatives`)
    .refine((ids) => new Set(ids).size === ids.length, 'Each exercise only once'),
})
export type ExerciseAlternativesInput = z.input<typeof exerciseAlternativesInput>
