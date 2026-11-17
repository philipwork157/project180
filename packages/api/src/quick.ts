// Quick workouts: someone builds their own workout in the app and starts it straight away.
// Staff always can (they train themselves); clients only when their coach turned it on.
import { type Db, exercises, users, workouts } from '@project180/db'
import {
  isStaff,
  type Me,
  type QuickWorkoutOptions,
  type QuickWorkoutsAccess,
  type Role,
} from '@project180/shared'
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { notFound } from './errors'
import { inMyBusiness } from './library'
import { loadWorkoutExercises, loadWorkoutGroups } from './routes/workouts'

/** How many of their own workouts the builder offers to start from. */
const MAX_SOURCES = 100

export async function canQuickWorkout(db: Db, user: Me): Promise<boolean> {
  return (await quickWorkoutsAccess(db, user)).enabled
}

/** A person's switch, for their coach. */
export async function quickWorkoutsAccess(
  db: Db,
  person: { id: number; role: Role },
): Promise<QuickWorkoutsAccess> {
  if (isStaff(person.role)) return { enabled: true, always: true }
  const [row] = await db
    .select({ on: users.quickWorkouts })
    .from(users)
    .where(eq(users.id, person.id))
  return { enabled: row?.on === true, always: false }
}

export async function assertCanQuickWorkout(db: Db, user: Me) {
  if (!(await canQuickWorkout(db, user)))
    throw new HTTPException(403, { message: 'Quick workouts aren’t turned on for you' })
}

/**
 * Workouts someone may start a quick workout from: their own personal copies (from programs
 * they were given) and, for staff, the library workouts they made. Never anyone else's, and
 * never other quick workouts.
 */
function sourcesFor(user: Me) {
  const own = eq(workouts.clientId, user.id)
  return and(
    isNull(workouts.archivedAt),
    eq(workouts.quick, false),
    isStaff(user.role)
      ? or(own, and(eq(workouts.createdBy, user.id), isNull(workouts.clientId)))
      : own,
  )
}

export async function quickWorkoutOptions(db: Db, user: Me): Promise<QuickWorkoutOptions> {
  if (!(await canQuickWorkout(db, user))) return { enabled: false, workouts: [] }
  const rows = await db
    .select({ id: workouts.id, name: workouts.name })
    .from(workouts)
    .where(sourcesFor(user))
    .orderBy(desc(workouts.id))
    .limit(MAX_SOURCES)
  // A program given twice leaves two copies with the same name: offer the newest once.
  const seen = new Set<string>()
  const unique = rows.filter((r) => {
    const key = r.name.trim().toLowerCase()
    return !seen.has(key) && seen.add(key)
  })
  const ids = unique.map((r) => r.id)
  const [items, groups] = await Promise.all([
    loadWorkoutExercises(db, ids),
    loadWorkoutGroups(db, ids),
  ])
  return {
    enabled: true,
    workouts: unique
      .map((r) => ({
        id: r.id,
        name: r.name,
        exercises: items.get(r.id) ?? [],
        groups: groups.get(r.id) ?? [],
      }))
      .filter((w) => w.exercises.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

/** The workout it was built from must be one they could pick (404 otherwise). */
export async function assertQuickSource(db: Db, user: Me, workoutId: number) {
  const [row] = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), sourcesFor(user)))
  if (!row) notFound('Workout not found')
}

/** Every exercise must exist, still be in use, and be in this person's business's library. */
export async function assertExercisesActive(db: Db, user: Me, exerciseIds: number[]) {
  const ids = [...new Set(exerciseIds)]
  const found = await db
    .select({ id: exercises.id })
    .from(exercises)
    .where(
      and(
        inArray(exercises.id, ids),
        isNull(exercises.archivedAt),
        inMyBusiness(exercises.businessId, user),
      ),
    )
  if (found.length !== ids.length)
    throw new HTTPException(400, { message: 'Unknown exercise in workout' })
}
