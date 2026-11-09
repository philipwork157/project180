import { integer } from 'drizzle-orm/sqlite-core'

// Every table uses an auto-increment integer id.
export const id = () => integer('id').primaryKey({ autoIncrement: true })

// Moments are stored as Unix milliseconds (UTC) and read back as Date.
export const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' })

export const createdAt = () =>
  timestamp('created_at')
    .notNull()
    .$defaultFn(() => new Date())

export const updatedAt = () =>
  timestamp('updated_at')
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
