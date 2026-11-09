// Who may see and manage whom. Owners see everyone; a coach (role admin) sees
// themselves and the clients they coach; a client sees only themselves.
import { type Db, users } from '@project180/db'
import { isOwner, isStaff, type Me, type Role } from '@project180/shared'
import { eq, or } from 'drizzle-orm'
import { notFound } from './errors'

export interface Person {
  id: number
  name: string
  timezone: string
  role: Role
  coachId: number | null
}

export function canManage(me: Me, person: { id: number; coachId: number | null }): boolean {
  if (person.id === me.id) return true
  if (isOwner(me.role)) return true
  return isStaff(me.role) && person.coachId === me.id
}

/** SQL filter on `users` for the people `me` may see. */
export function managedUsers(me: Me) {
  if (isOwner(me.role)) return undefined
  if (isStaff(me.role)) return or(eq(users.id, me.id), eq(users.coachId, me.id))
  return eq(users.id, me.id)
}

/** The person, if `me` may manage them; otherwise 404 (so nobody learns who else exists). */
export async function managedPerson(db: Db, me: Me, id: number): Promise<Person> {
  const [person] = await db
    .select({
      id: users.id,
      name: users.name,
      timezone: users.timezone,
      role: users.role,
      coachId: users.coachId,
    })
    .from(users)
    .where(eq(users.id, id))
  if (!person || !canManage(me, person)) notFound('User not found')
  return person
}
