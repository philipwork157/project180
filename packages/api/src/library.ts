import { type Db, users } from '@project180/db'
import { isClient, isOwner, isStaff, type Me } from '@project180/shared'
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import { forbidden } from './errors'
import { starterBusinessSql } from './starter'

/** The columns every library table (exercises, workouts, programs) shares. */
export interface LibraryColumns {
  archivedAt: AnySQLiteColumn
  createdBy: AnySQLiteColumn
  /** Workouts and programs: set on a client's personal copy. */
  clientId?: AnySQLiteColumn
  /** Exercises: the business whose library it's in. */
  businessId?: AnySQLiteColumn
}

/**
 * Rows of this person's own business (exercises, recipes). Clients without a business (using
 * the app on their own) read the starter library the platform admin picked; anyone else
 * without a business (the platform admin) sees none.
 */
export function inMyBusiness(column: AnySQLiteColumn, user: Me) {
  if (user.businessId !== null) return eq(column, user.businessId)
  return isClient(user.role) ? sql`${column} = ${starterBusinessSql}` : sql`0`
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
 * - staff see every exercise in their own business's library;
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
  if (!table.clientId)
    return isStaff(user.role) && table.businessId
      ? and(state, inMyBusiness(table.businessId, user))
      : and(state, sql`0`)
  // Your own library items, by who made them. A client's copy is never reached that way: the
  // coach who assigned it keeps created_by after the client moves to another coach, so copies
  // go only by whose client they are now (copiesFor).
  const clientId = table.clientId
  return and(
    state,
    or(
      isStaff(user.role) ? and(eq(table.createdBy, user.id), isNull(clientId)) : undefined,
      copiesFor(table, user),
    ),
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

/**
 * Only the creator or an owner of the same business may change a library row (exercises,
 * recipes). Coaches can duplicate exercises they see.
 */
export function assertCanEdit(user: Me, row: { createdBy: number; businessId: number | null }) {
  if (row.createdBy === user.id) return
  if (isOwner(user.role) && user.businessId !== null && row.businessId === user.businessId) return
  forbidden('Only its creator can change this')
}

/**
 * Workouts and programs: only their creator, or (a client's personal copy) whoever coaches
 * that client now. Owners get no exception here: other coaches' plans stay private.
 */
export async function assertCanEditItem(
  db: Db,
  user: Me,
  row: { createdBy: number; clientId: number | null },
) {
  // A library item: its creator. A copy: the person it's for (staff's own copies), or their
  // coach now, never the coach who made it if the client has since moved on.
  if (row.clientId === null) {
    if (row.createdBy === user.id) return
  } else if (row.clientId === user.id) return
  else if (isStaff(user.role)) {
    const [client] = await db
      .select({ coachId: users.coachId })
      .from(users)
      .where(eq(users.id, row.clientId))
    if (client?.coachId === user.id) return
  }
  forbidden('Only its creator can change this')
}

export const iso = (d: Date | null) => (d ? d.toISOString() : null)
