import { type Db, users } from '@project180/db'
import { isOwner, isStaff, type Me } from '@project180/shared'
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { forbidden } from './errors'

/** The columns every library table (exercises, workouts, programs) shares. */
export interface LibraryColumns {
  archivedAt: AnySQLiteColumn
  createdBy: AnySQLiteColumn
  /** Workouts and programs: set on a client's personal copy. */
  clientId?: AnySQLiteColumn
}

/** Client copies a user may see: their own, or (coaches) their clients'. */
function copiesFor(table: LibraryColumns, user: Me) {
  if (!table.clientId) return undefined
  if (isStaff(user.role)) {
    return or(
      eq(table.clientId, user.id),
      sql`${table.clientId} in (select ${users.id} from ${users} where ${users.coachId} = ${user.id})`,
    )
  }
  return eq(table.clientId, user.id)
}

/**
 * Library rows a user may see. The library is for staff only:
 * - everyone on staff sees every exercise;
 * - workouts and programs are private, owners included: staff see the ones they made, plus
 *   the personal copies of the clients they coach themselves (never another coach's clients');
 * - clients see only the personal copies made for them (through their plan), never the library.
 * `archived` picks active rows, archived rows, or both.
 */
export function visibleTo(table: LibraryColumns, user: Me, archived: boolean | 'any' = false) {
  const state =
    archived === 'any'
      ? undefined
      : archived
        ? isNotNull(table.archivedAt)
        : isNull(table.archivedAt)
  if (!table.clientId) return isStaff(user.role) ? state : and(state, sql`0`)
  return and(
    state,
    or(isStaff(user.role) ? eq(table.createdBy, user.id) : undefined, copiesFor(table, user)),
  )
}

/** Only library items (not clients' personal copies), or the library plus one client's copies. */
export function libraryOnly(
  table: LibraryColumns & { clientId: AnySQLiteColumn },
  clientId?: number,
) {
  return clientId
    ? or(isNull(table.clientId), eq(table.clientId, clientId))
    : isNull(table.clientId)
}

/** Only the creator or an owner may change a library row. Coaches can duplicate exercises they see. */
export function assertCanEdit(user: Me, row: { createdBy: number }) {
  if (row.createdBy !== user.id && !isOwner(user.role))
    forbidden('Only its creator can change this')
}

/**
 * Workouts and programs: only their creator, or (a client's personal copy) whoever coaches
 * that client. Owners get no exception here: other coaches' plans stay private.
 */
export async function assertCanEditItem(
  db: Db,
  user: Me,
  row: { createdBy: number; clientId: number | null },
) {
  if (row.createdBy === user.id) return
  if (row.clientId !== null && isStaff(user.role)) {
    const [client] = await db
      .select({ coachId: users.coachId })
      .from(users)
      .where(eq(users.id, row.clientId))
    if (client?.coachId === user.id) return
  }
  forbidden('Only its creator can change this')
}

export const iso = (d: Date | null) => (d ? d.toISOString() : null)
