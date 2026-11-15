// "Build with Claude": a coach describes a workout, Claude picks exercises from the library and
// answers in a fixed JSON shape (structured outputs), and the server turns that into a normal
// new workout through the same createWorkout as the "New workout" button.
//
// Safety by construction: this file only reads the exercise library and calls createWorkout.
// It never updates or deletes anything, never adds exercises, and never touches programs.
import { type Db, exercises } from '@project180/db'
import {
  GROUP_KINDS,
  type Me,
  type TrackingType,
  WORKOUT_SECTIONS,
  type WorkoutBuildResult,
  workoutInput,
} from '@project180/shared'
import { asc } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { isTestSite } from './email'
import type { Bindings } from './env'
import { visibleTo } from './library'
import { assertExercisesUsable, createWorkout, detail } from './routes/workouts'

const API_URL = 'https://api.anthropic.com/v1/messages'
/** Override with WORKOUT_MODEL (wrangler vars) to try another model without a code change. */
export const DEFAULT_WORKOUT_MODEL = 'claude-sonnet-5-5'
const TIMEOUT_MS = 90_000

const INSTRUCTIONS = `You are a strength and conditioning coach building one workout for a coaching app in South Africa. The coach describes what they want; you build it ONLY from the exercise library you are given.

Rules:
- Use only exercise ids from the library list. Never invent an id. If an exercise you would want is not in the list, pick the closest one that is, and name the one you wanted in "missing".
- Respect the equipment, time, level and focus the coach asks for. If they give a duration, fit the workout to it (warm-up, main work and rest included) and set estimated_minutes.
- Sections: warm_up (short, light), main, cool_down (stretching or mobility). Only add a warm-up or cool-down if it suits the request.
- Each exercise: sets (1–10), rest_seconds (0–300). For exercises tracked by reps give reps_min and reps_max (equal for a fixed number); for exercises tracked by time give seconds instead and leave reps null.
- Supersets and circuits: give the exercises the same group number (1, 2, …) and describe each group once in "groups" (kind superset, circuit or interval, rounds, and for intervals work_seconds and rest_seconds). Exercises not in a group have group null.
- 3 to 12 exercises is normal. Keep notes short and practical (a cue or a tempo), or null.
- name: short and clear, like "Upper Body Dumbbells A" (max 60 characters). description: one sentence for the coach.
- Pelvic floor, pregnancy and postnatal work: only include it if the coach asks for it.`

/** One exercise in a workout, as Claude answers it (shared with the program builder). */
export const EXERCISE_SCHEMA = {
  type: 'object',
  properties: {
    exercise_id: { type: 'integer' },
    section: { type: 'string', enum: [...WORKOUT_SECTIONS] },
    sets: { type: 'integer' },
    reps_min: { type: ['integer', 'null'] },
    reps_max: { type: ['integer', 'null'] },
    seconds: { type: ['integer', 'null'] },
    rest_seconds: { type: 'integer' },
    group: { type: ['integer', 'null'] },
    notes: { type: ['string', 'null'] },
  },
  required: [
    'exercise_id',
    'section',
    'sets',
    'reps_min',
    'reps_max',
    'seconds',
    'rest_seconds',
    'group',
    'notes',
  ],
  additionalProperties: false,
}

/** One superset, circuit or interval group, as Claude answers it. */
export const GROUP_SCHEMA = {
  type: 'object',
  properties: {
    group: { type: 'integer' },
    kind: { type: 'string', enum: [...GROUP_KINDS] },
    rounds: { type: 'integer' },
    work_seconds: { type: ['integer', 'null'] },
    rest_seconds: { type: ['integer', 'null'] },
  },
  required: ['group', 'kind', 'rounds', 'work_seconds', 'rest_seconds'],
  additionalProperties: false,
}

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: ['string', 'null'] },
    estimated_minutes: { type: ['integer', 'null'] },
    exercises: { type: 'array', items: EXERCISE_SCHEMA },
    groups: { type: 'array', items: GROUP_SCHEMA },
    missing: { type: 'array', items: { type: 'string' } },
    note: { type: ['string', 'null'] },
  },
  required: ['name', 'description', 'estimated_minutes', 'exercises', 'groups', 'missing', 'note'],
  additionalProperties: false,
}

/** Whole numbers clamped into a range (models sometimes overshoot). */
export const int = (min: number, max: number) =>
  z
    .number()
    .finite()
    .transform((n) => Math.min(max, Math.max(min, Math.round(n))))

/** The workout part of an answer; the program builder checks each new workout with it too. */
export const workoutReply = {
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().catch(null),
  estimated_minutes: int(5, 240).nullable().catch(null),
  exercises: z
    .array(
      z.object({
        exercise_id: z.number().int(),
        section: z.enum(WORKOUT_SECTIONS).catch('main'),
        sets: int(1, 10),
        reps_min: int(1, 100).nullable().catch(null),
        reps_max: int(1, 100).nullable().catch(null),
        seconds: int(5, 3600).nullable().catch(null),
        rest_seconds: int(0, 300),
        group: int(1, 20).nullable().catch(null),
        notes: z.string().trim().max(300).nullable().catch(null),
      }),
    )
    .max(40),
  groups: z
    .array(
      z.object({
        group: int(1, 20),
        kind: z.enum(GROUP_KINDS).catch('superset'),
        rounds: int(1, 20),
        work_seconds: int(5, 3600).nullable().catch(null),
        rest_seconds: int(0, 3600).nullable().catch(null),
      }),
    )
    .max(20)
    .catch([]),
}

const replySchema = z.object({
  ...workoutReply,
  missing: z.array(z.string().trim().min(1).max(120)).max(20).catch([]),
  note: z.string().trim().max(500).nullable().catch(null),
})

export type BuilderReply = z.output<typeof replySchema>

export interface LibraryExercise {
  id: number
  name: string
  muscleGroup: string
  equipment: string
  trackingType: TrackingType
}

/** The library as Claude sees it: one line per exercise, id first. Archived ones are left out. */
export async function libraryFor(db: Db, user: Me): Promise<LibraryExercise[]> {
  return db
    .select({
      id: exercises.id,
      name: exercises.name,
      muscleGroup: exercises.muscleGroup,
      equipment: exercises.equipment,
      trackingType: exercises.trackingType,
    })
    .from(exercises)
    .where(visibleTo(exercises, user, false))
    .orderBy(asc(exercises.muscleGroup), asc(exercises.name))
}

const TRACKED_BY: Record<TrackingType, string> = {
  weight_reps: 'reps',
  reps: 'reps (bodyweight)',
  time: 'time',
  distance_time: 'time',
}

export function libraryText(library: LibraryExercise[]) {
  return library
    .map(
      (e) =>
        `${e.id} | ${e.name} | ${e.muscleGroup} | ${e.equipment} | ${TRACKED_BY[e.trackingType]}`,
    )
    .join('\n')
}

/** What a build asks Claude for. Shared by the workout and program builders. */
export interface ClaudeRequest<T> {
  /** For the logs and error messages: 'workout-builder', 'program-builder'. */
  tag: string
  /** Shown to the coach when it fails: 'Claude couldn’t build that workout. …' */
  failMessage: string
  system: string
  /** The user turn, as separate text blocks. */
  texts: string[]
  /** The JSON shape Claude must answer in (structured outputs). */
  schema: object
  /** Checks (and tidies) the answer. */
  check: z.ZodType<T>
  maxTokens: number
  timeoutMs: number
  /** For the log line: how big the answer was. */
  size: (reply: T) => string
}

/** Logs why a build failed and answers a friendly 502 (with the reason on local and dev sites). */
function failed(env: Bindings, tag: string, message: string, reason: string, detail?: unknown) {
  console.error(`[${tag}] ${reason}`, detail ?? '')
  return new HTTPException(502, { message: isTestSite(env) ? `${message} (${reason})` : message })
}

/** Asks Claude for a JSON answer. Returns it checked; throws a friendly error otherwise. */
export async function askClaude<T>(env: Bindings, req: ClaudeRequest<T>): Promise<T> {
  const key = env.ANTHROPIC_API_KEY
  if (!key) throw new HTTPException(503, { message: 'Build with Claude isn’t set up yet.' })
  const model = env.WORKOUT_MODEL || DEFAULT_WORKOUT_MODEL
  const fail = (reason: string, detail?: unknown) =>
    failed(env, req.tag, req.failMessage, reason, detail)
  const started = Date.now()
  let res: Response
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.texts.map((text) => ({ type: 'text', text })) }],
        output_config: { format: { type: 'json_schema', schema: req.schema } },
      }),
      signal: AbortSignal.timeout(req.timeoutMs),
    })
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError'
    throw fail(
      timedOut ? `Claude took longer than ${req.timeoutMs / 1000}s` : 'could not reach Claude',
      err,
    )
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      error?: { type?: string; message?: string }
    } | null
    throw fail(
      `Claude answered ${res.status} ${body?.error?.type ?? ''}: ${body?.error?.message ?? res.statusText}`,
      { model, requestId: res.headers.get('request-id') },
    )
  }
  const data = (await res.json().catch(() => null)) as {
    stop_reason?: string
    content?: Array<{ type: string; text?: string }>
    usage?: unknown
  } | null
  const text = data?.content?.find((b) => b.type === 'text')?.text
  if (!text) throw fail(`no answer from Claude (stop: ${data?.stop_reason ?? 'none'})`)
  if (data?.stop_reason === 'max_tokens') throw fail('Claude’s answer was cut off')
  let parsed: z.ZodSafeParseResult<T>
  try {
    parsed = req.check.safeParse(JSON.parse(text))
  } catch {
    throw fail('Claude’s answer wasn’t JSON', isTestSite(env) ? text.slice(0, 500) : undefined)
  }
  if (!parsed.success)
    throw fail('Claude’s answer wasn’t in the expected shape', parsed.error.issues[0])
  console.log(
    `[${req.tag}] ${req.size(parsed.data)} with ${model} in ${Date.now() - started} ms`,
    data?.usage ?? '',
  )
  return parsed.data
}

/** Asks Claude for a workout. Returns its checked answer; throws a friendly error otherwise. */
export function askClaudeForWorkout(
  env: Bindings,
  prompt: string,
  library: LibraryExercise[],
): Promise<BuilderReply> {
  return askClaude(env, {
    tag: 'workout-builder',
    failMessage: 'Claude couldn’t build that workout. Try again, or describe it differently.',
    system: INSTRUCTIONS,
    texts: [
      `Exercise library (id | name | muscle group | equipment | tracked by):\n${libraryText(library)}`,
      `The coach asks for:\n${prompt}`,
    ],
    schema: REPLY_SCHEMA,
    check: replySchema,
    maxTokens: 8000,
    timeoutMs: TIMEOUT_MS,
    size: (r) => `${r.exercises.length} exercises`,
  })
}

/**
 * Turns Claude's answer into the same input the workout editor sends, keeping only exercises
 * that really are in the library. Returns null when nothing usable is left.
 */
export function toWorkoutInput(
  reply: Pick<BuilderReply, 'name' | 'description' | 'estimated_minutes' | 'exercises' | 'groups'>,
  library: LibraryExercise[],
  prompt: string,
  credit = 'Built with Claude from',
) {
  const byId = new Map(library.map((e) => [e.id, e]))
  const kept = reply.exercises.filter((e) => byId.has(e.exercise_id))
  if (kept.length === 0) return null
  const items = kept.map((e) => {
    const tracking = byId.get(e.exercise_id)?.trackingType ?? 'weight_reps'
    const timed = tracking === 'time' || tracking === 'distance_time'
    const low = e.reps_min ?? e.reps_max
    const high = e.reps_max ?? e.reps_min
    return {
      exerciseId: e.exercise_id,
      section: e.section,
      targetSets: e.sets,
      targetRepsMin: timed ? null : low !== null && high !== null ? Math.min(low, high) : null,
      targetRepsMax: timed ? null : low !== null && high !== null ? Math.max(low, high) : null,
      targetSeconds: timed ? (e.seconds ?? 30) : null,
      bodyweight: tracking === 'reps',
      restSeconds: e.rest_seconds,
      supersetGroup: e.group,
      notes: e.notes,
    }
  })
  const quoted = prompt.length > 300 ? `${prompt.slice(0, 297)}…` : prompt
  const description = [reply.description, `${credit}: “${quoted}”`].filter(Boolean).join('\n\n')
  const result = workoutInput.safeParse({
    name: reply.name.slice(0, 80),
    description: description.slice(0, 1000),
    estimatedMinutes: reply.estimated_minutes,
    // Warm-up first, then the main work, then the cool-down, each in Claude's order.
    exercises: [
      ...items.filter((i) => i.section === 'warm_up'),
      ...items.filter((i) => i.section === 'main'),
      ...items.filter((i) => i.section === 'cool_down'),
    ],
    groups: reply.groups.map((g) => ({
      groupNumber: g.group,
      kind: g.kind,
      rounds: g.rounds,
      workSeconds: g.kind === 'interval' ? g.work_seconds : null,
      restSeconds: g.rest_seconds,
    })),
  })
  return result.success ? result.data : null
}

/** The whole build: read the library, ask Claude, create one new workout. Nothing else changes. */
export async function buildWorkout(
  db: Db,
  env: Bindings,
  user: Me,
  prompt: string,
): Promise<WorkoutBuildResult> {
  const library = await libraryFor(db, user)
  if (library.length === 0)
    throw new HTTPException(409, { message: 'Add some exercises to the library first.' })
  const reply = await askClaudeForWorkout(env, prompt, library)
  const input = toWorkoutInput(reply, library, prompt)
  if (!input)
    throw new HTTPException(422, {
      message:
        'Claude couldn’t make a workout from your library for that. Try describing it differently.',
    })
  await assertExercisesUsable(db, user, input)
  const row = await createWorkout(db, user, input)
  return { workout: await detail(db, row), missing: reply.missing, note: reply.note }
}
