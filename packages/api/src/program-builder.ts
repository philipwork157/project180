// "Build with Claude" for programs: a coach describes a program, Claude lays it out over the
// weeks using workouts already in the library and, where nothing fits, new workouts built from
// the exercise library. The server turns that into a normal new program.
//
// Safety by construction: this file only reads the library and inserts new rows (createWorkout,
// createProgram). It never updates or deletes anything that was there before; if a build fails
// half-way, only the rows it just made are removed again. Editing stays in the program editor.
import { type Db, exercises, programs, workoutExercises, workouts } from '@project180/db'
import {
  type Me,
  type ProgramBuildResult,
  type ProgramDayInput,
  programInput,
} from '@project180/shared'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { chunk, inChunks, runAll } from './batch'
import type { ClaudeMeter } from './claude-calls'
import type { Bindings } from './env'
import { libraryOnly, visibleTo } from './library'
import { createProgram, programDetail } from './routes/programs'
import { assertExercisesUsable, createWorkout } from './routes/workouts'
import {
  askClaude,
  EXERCISE_SCHEMA,
  GROUP_SCHEMA,
  int,
  type LibraryExercise,
  libraryFor,
  libraryText,
  toWorkoutInput,
  workoutReply,
} from './workout-builder'

const TIMEOUT_MS = 170_000
export const MAX_WEEKS = 16
const MAX_NEW_WORKOUTS = 8
/** How many library workouts Claude is shown (newest first). */
const MAX_LISTED_WORKOUTS = 150

const INSTRUCTIONS = `You are a strength and conditioning coach building one multi-week training program for a coaching app in South Africa. The coach describes what they want; you lay it out over the weeks.

You are given two lists:
1. The coach's existing workouts (id | name | minutes | exercises). Reuse one by putting its id in existing_workout_id when it fits the request well.
2. The exercise library (id | name | muscle group | equipment | tracked by). When no existing workout fits, design a new workout in "new_workouts" using ONLY exercise ids from this list, and schedule it by its key in new_workout.

Program rules:
- duration_weeks: what the coach asks for, 1 to ${MAX_WEEKS} (4 if they don't say).
- schedule: one entry per training day. week runs 1..duration_weeks, day runs 1..7 within each program week (day 1 is the first day of the week). Days without an entry are rest days. Respect the number of training days per week the coach asks for and spread them sensibly (not 3 hard days in a row unless asked).
- Every entry has exactly one of existing_workout_id or new_workout (the other null).
- Keep the number of different workouts small and reuse them across weeks (an A/B or A/B/C rotation is typical). At most ${MAX_NEW_WORKOUTS} new workouts.
- Progression: a short note in "note" on how to progress week to week (e.g. add a set or load) is enough; don't make a new workout per week.
- weigh_in_day: a day 1..7 for a weekly weigh-in only if the coach asks for weigh-ins or check-ins, otherwise null.

New workout rules (same as building a single workout):
- key: a short label like "A", "B", "C". name: short and clear, like "Full Body A" (max 60 characters). description: one sentence.
- Sections: warm_up (short, light), main, cool_down (stretching or mobility). Only add a warm-up or cool-down if it suits the request.
- Each exercise: sets (1–10), rest_seconds (0–300). For exercises tracked by reps give reps_min and reps_max (equal for a fixed number); for exercises tracked by time give seconds instead and leave reps null.
- Supersets and circuits: give the exercises the same group number (1, 2, …) and describe each group once in that workout's "groups". Exercises not in a group have group null.
- 3 to 10 exercises per workout. Keep notes short and practical, or null.
- If an exercise you want is not in the library, pick the closest one that is and name the one you wanted in "missing".

Program name: short and clear, like "Beginner Full Body 8 Weeks" (max 60 characters). description: one or two sentences for the coach.
Pelvic floor, pregnancy and postnatal work: only include it if the coach asks for it.`

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    duration_weeks: { type: 'integer' },
    weigh_in_day: { type: ['integer', 'null'] },
    new_workouts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          description: { type: ['string', 'null'] },
          estimated_minutes: { type: ['integer', 'null'] },
          exercises: { type: 'array', items: EXERCISE_SCHEMA },
          groups: { type: 'array', items: GROUP_SCHEMA },
        },
        required: ['key', 'name', 'description', 'estimated_minutes', 'exercises', 'groups'],
        additionalProperties: false,
      },
    },
    schedule: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          week: { type: 'integer' },
          day: { type: 'integer' },
          existing_workout_id: { type: ['integer', 'null'] },
          new_workout: { type: ['string', 'null'] },
        },
        required: ['week', 'day', 'existing_workout_id', 'new_workout'],
        additionalProperties: false,
      },
    },
    missing: { type: 'array', items: { type: 'string' } },
    note: { type: ['string', 'null'] },
  },
  required: [
    'name',
    'description',
    'duration_weeks',
    'weigh_in_day',
    'new_workouts',
    'schedule',
    'missing',
    'note',
  ],
  additionalProperties: false,
}

const replySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().catch(null),
  duration_weeks: int(1, MAX_WEEKS),
  weigh_in_day: int(1, 7).nullable().catch(null),
  new_workouts: z
    .array(z.object({ key: z.string().trim().min(1).max(40), ...workoutReply }))
    .max(MAX_NEW_WORKOUTS * 2)
    .catch([]),
  schedule: z
    .array(
      z.object({
        week: z.number().int(),
        day: z.number().int(),
        existing_workout_id: z.number().int().nullable().catch(null),
        new_workout: z.string().trim().max(40).nullable().catch(null),
      }),
    )
    .max(MAX_WEEKS * 7 * 2),
  missing: z.array(z.string().trim().min(1).max(120)).max(30).catch([]),
  note: z.string().trim().max(800).nullable().catch(null),
})

export type ProgramBuilderReply = z.output<typeof replySchema>

export interface LibraryWorkout {
  id: number
  name: string
  estimatedMinutes: number | null
  exerciseNames: string[]
}

/** The coach's library workouts as Claude sees them (no client copies, nothing archived). */
export async function workoutsFor(db: Db, user: Me): Promise<LibraryWorkout[]> {
  const rows = await db
    .select({ id: workouts.id, name: workouts.name, estimatedMinutes: workouts.estimatedMinutes })
    .from(workouts)
    .where(and(visibleTo(workouts, user, false), libraryOnly(workouts)))
    .orderBy(asc(workouts.name))
    .limit(MAX_LISTED_WORKOUTS)
  const items = await inChunks(
    rows.map((r) => r.id),
    (ids) =>
      db
        .select({ workoutId: workoutExercises.workoutId, name: exercises.name })
        .from(workoutExercises)
        .innerJoin(exercises, eq(exercises.id, workoutExercises.exerciseId))
        .where(inArray(workoutExercises.workoutId, ids))
        .orderBy(asc(workoutExercises.workoutId), asc(workoutExercises.position)),
  )
  const namesOf = new Map<number, string[]>()
  for (const i of items) namesOf.set(i.workoutId, [...(namesOf.get(i.workoutId) ?? []), i.name])
  return rows.map((r) => ({ ...r, exerciseNames: namesOf.get(r.id) ?? [] }))
}

function workoutsText(list: LibraryWorkout[]) {
  if (list.length === 0) return '(none yet)'
  return list
    .map((w) => {
      const names = w.exerciseNames.slice(0, 10).join(', ')
      const more = w.exerciseNames.length > 10 ? ', …' : ''
      return `${w.id} | ${w.name} | ${w.estimatedMinutes ?? '?'} min | ${names}${more}`
    })
    .join('\n')
}

/** Asks Claude for a program. Returns its checked answer; throws a friendly error otherwise. */
export function askClaudeForProgram(
  env: Bindings,
  prompt: string,
  library: LibraryExercise[],
  existing: LibraryWorkout[],
  meter: ClaudeMeter,
): Promise<ProgramBuilderReply> {
  return askClaude(
    env,
    {
      tag: 'program-builder',
      failMessage: 'Claude couldn’t build that program. Try again, or describe it differently.',
      system: INSTRUCTIONS,
      texts: [
        `Existing workouts (id | name | minutes | exercises):\n${workoutsText(existing)}`,
        `Exercise library (id | name | muscle group | equipment | tracked by):\n${libraryText(library)}`,
        `The coach asks for:\n${prompt}`,
      ],
      schema: REPLY_SCHEMA,
      check: replySchema,
      maxTokens: 20000,
      timeoutMs: TIMEOUT_MS,
      size: (r) => `${r.duration_weeks} weeks, ${r.new_workouts.length} new workouts`,
    },
    meter,
  )
}

type WorkoutInputParsed = NonNullable<ReturnType<typeof toWorkoutInput>>

/**
 * Turns Claude's answer into a plan: the new workouts to create (only those it schedules) and
 * the schedule, keeping only existing workouts that really are in the coach's library. Returns
 * null when no training day is left.
 */
export function toProgramPlan(
  reply: ProgramBuilderReply,
  library: LibraryExercise[],
  existing: LibraryWorkout[],
  prompt: string,
) {
  const weeks = reply.duration_weeks
  const existingById = new Map(existing.map((w) => [w.id, w]))
  const credit = `Built with Claude for the program “${reply.name.slice(0, 80)}”, from`
  // The new workouts that came out usable, by key (the first of each key wins).
  const newByKey = new Map<string, WorkoutInputParsed>()
  for (const w of reply.new_workouts) {
    const key = w.key.toLowerCase()
    if (newByKey.has(key) || newByKey.size >= MAX_NEW_WORKOUTS) continue
    const input = toWorkoutInput(w, library, prompt, credit)
    if (input) newByKey.set(key, input)
  }
  type Ref = { existing: number } | { key: string }
  const slots = new Map<string, { week: number; day: number; ref: Ref }>()
  for (const s of reply.schedule) {
    if (s.week < 1 || s.week > weeks || s.day < 1 || s.day > 7) continue
    const slot = `${s.week}:${s.day}`
    if (slots.has(slot)) continue
    const key = s.new_workout?.toLowerCase()
    if (key && newByKey.has(key)) slots.set(slot, { week: s.week, day: s.day, ref: { key } })
    else if (s.existing_workout_id !== null && existingById.has(s.existing_workout_id))
      slots.set(slot, { week: s.week, day: s.day, ref: { existing: s.existing_workout_id } })
  }
  if (slots.size === 0) return null
  const used = new Set([...slots.values()].flatMap((s) => ('key' in s.ref ? [s.ref.key] : [])))
  const reused = [
    ...new Set([...slots.values()].flatMap((s) => ('existing' in s.ref ? [s.ref.existing] : []))),
  ].map((id) => ({ id, name: existingById.get(id)?.name ?? '' }))
  return {
    name: reply.name.slice(0, 80),
    description: [reply.description, `Built with Claude from: “${prompt.slice(0, 300)}”`]
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 1000),
    durationWeeks: weeks,
    weighInDay: reply.weigh_in_day,
    newWorkouts: [...newByKey].filter(([key]) => used.has(key)),
    reused,
    slots: [...slots.values()],
  }
}

/**
 * The whole build: read the library, ask Claude, then insert the new workouts and the new
 * program. Nothing that was there before is changed.
 */
export async function buildProgram(
  db: Db,
  env: Bindings,
  user: Me,
  prompt: string,
  meter: ClaudeMeter,
): Promise<ProgramBuildResult> {
  const [library, existing] = await Promise.all([libraryFor(db, user), workoutsFor(db, user)])
  if (library.length === 0 && existing.length === 0)
    throw new HTTPException(409, {
      message: 'Add some exercises or workouts to the library first.',
    })
  const reply = await askClaudeForProgram(env, prompt, library, existing, meter)
  meter.kind = 'program'
  meter.items = reply.new_workouts.length
  const plan = toProgramPlan(reply, library, existing, prompt)
  if (!plan)
    throw new HTTPException(422, {
      message:
        'Claude couldn’t make a program from your library for that. Try describing it differently.',
    })
  for (const [, input] of plan.newWorkouts) await assertExercisesUsable(db, user, input)

  const createdWorkouts: number[] = []
  let createdProgram: number | null = null
  let saved: { row: typeof programs.$inferSelect; newWorkouts: ProgramBuildResult['newWorkouts'] }
  try {
    const idOfKey = new Map<string, { id: number; name: string; exercises: number }>()
    for (const [key, input] of plan.newWorkouts) {
      const row = await createWorkout(db, user, input)
      createdWorkouts.push(row.id)
      idOfKey.set(key, { id: row.id, name: row.name, exercises: input.exercises.length })
    }
    const days = new Map<string, ProgramDayInput>()
    for (const s of plan.slots) {
      const workoutId = 'key' in s.ref ? (idOfKey.get(s.ref.key)?.id ?? null) : s.ref.existing
      days.set(`${s.week}:${s.day}`, {
        weekNumber: s.week,
        dayNumber: s.day,
        workoutId,
        checkinRequired: plan.weighInDay === s.day,
      })
    }
    if (plan.weighInDay !== null)
      for (let week = 1; week <= plan.durationWeeks; week++)
        if (!days.has(`${week}:${plan.weighInDay}`))
          days.set(`${week}:${plan.weighInDay}`, {
            weekNumber: week,
            dayNumber: plan.weighInDay,
            workoutId: null,
            checkinRequired: true,
          })
    const input = programInput.parse({
      name: plan.name,
      description: plan.description,
      durationWeeks: plan.durationWeeks,
      days: [...days.values()],
    })
    const row = await createProgram(db, user, input)
    createdProgram = row.id
    saved = { row, newWorkouts: [...idOfKey.values()] }
  } catch (err) {
    // Take back only what this build just made (their days, rows and groups go with them).
    await runAll(db, [
      ...(createdProgram === null
        ? []
        : [db.delete(programs).where(eq(programs.id, createdProgram))]),
      ...chunk(createdWorkouts).map((ids) => db.delete(workouts).where(inArray(workouts.id, ids))),
    ]).catch((cleanup) => console.error('[program-builder] cleanup failed', cleanup))
    throw err
  }
  return {
    program: await programDetail(db, saved.row),
    newWorkouts: saved.newWorkouts,
    reusedWorkouts: plan.reused,
    missing: reply.missing,
    note: reply.note,
  }
}
