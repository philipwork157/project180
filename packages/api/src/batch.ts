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
