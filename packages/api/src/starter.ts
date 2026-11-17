// The starter library: one business the platform admin picks (app_settings). People using the
// app without a coach read its exercises, recipes and programs; every new coach business gets
// its own copy of its exercises and recipes to start from.
import { appSettings, type Db, programDays, programs, users } from '@project180/db'
import type { StarterProgram } from '@project180/shared'
import { and, asc, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

export const STARTER_KEY = 'starter_business_id'

/** The starter business's id, inside a query (null when none is picked). */
export const starterBusinessSql = sql`(select cast(${appSettings.value} as integer) from ${appSettings} where ${appSettings.key} = ${STARTER_KEY})`

export async function starterBusinessId(db: Db): Promise<number | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, STARTER_KEY))
  const n = Number(row?.value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function setStarterBusiness(db: Db, businessId: number | null, userId: number) {
  if (businessId === null) {
    await db.delete(appSettings).where(eq(appSettings.key, STARTER_KEY))
    return
  }
  const values = { value: String(businessId), updatedBy: userId }
  await db
    .insert(appSettings)
    .values({ key: STARTER_KEY, ...values })
    .onConflictDoUpdate({ target: appSettings.key, set: { ...values, updatedAt: new Date() } })
}

/**
 * Gives a new business its own copy of the starter library: exercises, recipes and library
 * workouts (with their rows and groups, pointing at the copied exercises). One batch of a fixed
 * number of statements, however many rows. Stock photos come along; a coach's uploaded photos
 * don't, because removing one would remove it for every business that shared the file.
 * Programs aren't copied: they stay the starter programs for people on their own.
 */
export async function copyStarterLibrary(db: Db, businessId: number, ownerId: number) {
  const starter = await starterBusinessId(db)
  if (starter === null || starter === businessId) return
  const now = Date.now()
  await db.batch([
    db.run(sql`insert into exercises (name, muscle_group, category, equipment, tracking_type, instructions, keywords, video_url, image_key, created_by, business_id, created_at, updated_at)
      select name, muscle_group, category, equipment, tracking_type, instructions, keywords, video_url,
        case when image_key like 'uploads/%' then null else image_key end,
        ${ownerId}, ${businessId}, ${now}, ${now}
      from exercises where business_id = ${starter} and archived_at is null`),
    db.run(sql`insert into recipes (title, summary, meal, category, servings, prep_minutes, cook_minutes, kcal, protein_g, carbs_g, fat_g, ingredients, steps, tips, source_name, source_url, image_key, created_by, business_id, created_at, updated_at)
      select title, summary, meal, category, servings, prep_minutes, cook_minutes, kcal, protein_g, carbs_g, fat_g, ingredients, steps, tips, source_name, source_url,
        case when image_key like 'uploads/%' then null else image_key end,
        ${ownerId}, ${businessId}, ${now}, ${now}
      from recipes where business_id = ${starter} and archived_at is null`),
    // Workouts: source_workout_id holds the starter workout's id just long enough to copy its
    // rows and groups, then it's cleared (it's only meant for clients' copies).
    db.run(sql`insert into workouts (name, description, estimated_minutes, created_by, source_workout_id, created_at, updated_at)
      select name, description, estimated_minutes, ${ownerId}, id, ${now}, ${now}
      from workouts
      where client_id is null and archived_at is null and quick = 0
        and created_by in (select id from users where business_id = ${starter} and role in ('owner', 'admin'))`),
    db.run(sql`insert into workout_groups (workout_id, group_number, kind, rounds, work_seconds, rest_seconds)
      select nw.id, g.group_number, g.kind, g.rounds, g.work_seconds, g.rest_seconds
      from workout_groups g
      join workouts nw on nw.source_workout_id = g.workout_id
        and nw.created_by = ${ownerId} and nw.created_at = ${now} and nw.client_id is null`),
    db.run(sql`insert into workout_exercises (workout_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_reps_per_set, bodyweight, target_seconds, rest_seconds, section, target_distance_m, target_pace_seconds, target_hr_zone, superset_group, notes)
      select nw.id,
        (select min(ne.id) from exercises ne where ne.business_id = ${businessId} and ne.name = oe.name),
        we.position, we.target_sets, we.target_reps_min, we.target_reps_max, we.target_reps_per_set,
        we.bodyweight, we.target_seconds, we.rest_seconds, we.section, we.target_distance_m,
        we.target_pace_seconds, we.target_hr_zone, we.superset_group, we.notes
      from workout_exercises we
      join workouts nw on nw.source_workout_id = we.workout_id
        and nw.created_by = ${ownerId} and nw.created_at = ${now} and nw.client_id is null
      join exercises oe on oe.id = we.exercise_id
      where exists (select 1 from exercises ne where ne.business_id = ${businessId} and ne.name = oe.name)`),
    db.run(sql`update workouts set source_workout_id = null
      where created_by = ${ownerId} and created_at = ${now} and client_id is null`),
  ])
}

/** Programs in the starter library: built by its staff, not a client's copy, not archived. */
export function starterProgramsWhere() {
  return and(
    isNull(programs.clientId),
    isNull(programs.archivedAt),
    inArray(programs.createdBy, staffOfStarter()),
  )
}

/** Staff of the starter business, as a subquery. */
function staffOfStarter() {
  return sql`(select ${users.id} from ${users} where ${users.businessId} = ${starterBusinessSql} and ${users.role} in ('owner', 'admin'))`
}

/** The ready-made programs someone without a coach can start, with their days a week. */
export async function listStarterPrograms(db: Db): Promise<StarterProgram[]> {
  const rows = await db
    .select({
      id: programs.id,
      name: programs.name,
      description: programs.description,
      durationWeeks: programs.durationWeeks,
    })
    .from(programs)
    .where(starterProgramsWhere())
    .orderBy(asc(programs.name))
  if (rows.length === 0) return []
  const days = await db
    .select({ programId: programDays.programId, n: count() })
    .from(programDays)
    .where(
      and(
        inArray(
          programDays.programId,
          rows.map((r) => r.id),
        ),
        eq(programDays.weekNumber, 1),
        isNotNull(programDays.workoutId),
      ),
    )
    .groupBy(programDays.programId)
  const daysOf = new Map(days.map((d) => [d.programId, d.n]))
  return rows.map((r) => ({ ...r, daysPerWeek: daysOf.get(r.id) ?? 0 }))
}

/** One starter program, or null. */
export async function findStarterProgram(db: Db, id: number) {
  const [row] = await db
    .select()
    .from(programs)
    .where(and(eq(programs.id, id), starterProgramsWhere()))
  return row ?? null
}
