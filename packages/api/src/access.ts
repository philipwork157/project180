// Who may see and manage whom. Owners see everyone; a coach (role admin) sees
// themselves and the clients they coach; a client sees only themselves.
// A person's programs and workouts are stricter: only they and their own coach see them,
// owners included (coachedPerson / coachedUsers). Owners see only their own business: nobody in
// another business is theirs to see or manage. The platform admin's own account belongs to no
// business, so no owner ever sees it, and they see nobody (they're not staff).
import { type Db, users } from '@project180/db'
import { isOwner, isStaff, type Me, type Role } from '@project180/shared'
import { and, eq, or } from 'drizzle-orm'
import { notFound } from './errors'

export interface Person {
  id: number
  name: string
  timezone: string
  role: Role
  coachId: number | null
  businessId: number | null
}

export function canManage(
  me: Me,
  person: { id: number; coachId: number | null; role?: Role; businessId: number | null },
): boolean {
  if (person.id === me.id) return true
  if (person.role === 'platform') return false
  if (isOwner(me.role)) return me.businessId !== null && person.businessId === me.businessId
  return isStaff(me.role) && person.coachId === me.id
}

/** SQL filter on `users` for the people `me` may see. */
export function managedUsers(me: Me) {
  // Owners see everyone in their own business (never the platform admin, who has none).
  if (isOwner(me.role))
    return me.businessId === null ? eq(users.id, me.id) : eq(users.businessId, me.businessId)
  if (isStaff(me.role)) return or(eq(users.id, me.id), eq(users.coachId, me.id))
  return eq(users.id, me.id)
}

/**
 * The clients `me` coaches themselves: what the People list, the Overview and the Messages inbox
 * show, for owners too. An owner can still open any client directly (managedPerson); the lists
 * just stay about their own clients until there are other coaches to oversee.
 */
export function myClients(me: Me) {
  return and(eq(users.role, 'member'), eq(users.coachId, me.id))
}

/**
 * Whether `me` may see `person`'s programs, workouts and training history: themselves, or a
 * client they coach. Being an owner doesn't widen this; owners manage accounts, not other
 * coaches' training plans.
 */
export function canCoach(me: Me, person: { id: number; coachId: number | null }): boolean {
  if (person.id === me.id) return true
  return isStaff(me.role) && person.coachId === me.id
}

/** SQL filter on `users` for the people whose programs and workouts `me` may see. */
export function coachedUsers(me: Me) {
  if (isStaff(me.role)) return or(eq(users.id, me.id), eq(users.coachId, me.id))
  return eq(users.id, me.id)
}

/** The person, if `me` may manage them; otherwise 404 (so nobody learns who else exists). */
export async function managedPerson(db: Db, me: Me, id: number): Promise<Person> {
  const person = await findPerson(db, id)
  if (!person || !canManage(me, person)) notFound('User not found')
  return person
}

/** The person, if `me` may see their programs and workouts (canCoach); otherwise 404. */
export async function coachedPerson(db: Db, me: Me, id: number): Promise<Person> {
  const person = await findPerson(db, id)
  if (!person || !canCoach(me, person)) notFound('User not found')
  return person
}

async function findPerson(db: Db, id: number): Promise<Person | undefined> {
  const [person] = await db
    .select({
      id: users.id,
      name: users.name,
      timezone: users.timezone,
      role: users.role,
      coachId: users.coachId,
      businessId: users.businessId,
    })
    .from(users)
    .where(eq(users.id, id))
  return person
}
