import type { Db } from '@project180/db'
import { getTableColumns } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

/** D1 allows at most 100 bound values in one statement ("too many SQL variables"). */
const MAX_VARIABLES = 100

/**
 * A multi-row insert split into statements that each stay under D1's variable limit.
 * Always use this for inserts whose row count depends on the data (program days, workout rows).
 */
export function insertMany<T extends SQLiteTable>(
  db: Db,
  table: T,
  rows: T['$inferInsert'][],
): BatchItem<'sqlite'>[] {
  const perStatement = Math.max(
    1,
    Math.floor(MAX_VARIABLES / Object.keys(getTableColumns(table)).length),
  )
  const statements: BatchItem<'sqlite'>[] = []
  for (let i = 0; i < rows.length; i += perStatement) {
    statements.push(db.insert(table).values(rows.slice(i, i + perStatement)) as BatchItem<'sqlite'>)
  }
  return statements
}

/** Runs statements as one batch (all or nothing). Does nothing for an empty list. */
export async function runAll(db: Db, statements: BatchItem<'sqlite'>[]) {
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
}

/** Splits ids into slices small enough for one statement (for deletes and updates in a batch). */
export function chunk(ids: number[], size = MAX_VARIABLES - 10): number[][] {
  const slices: number[][] = []
  for (let i = 0; i < ids.length; i += size) slices.push(ids.slice(i, i + size))
  return slices
}

/**
 * Runs a query once per slice of ids (each slice small enough for D1's variable limit, with
 * room for the query's other bound values), all slices together, and joins the rows.
 */
export async function inChunks<T>(
  ids: number[],
  query: (slice: number[]) => Promise<T[]>,
  size = MAX_VARIABLES - 10,
): Promise<T[]> {
  if (ids.length === 0) return []
  return (await Promise.all(chunk(ids, size).map(query))).flat()
}
