// Site-wide switches the owner controls in the admin (Settings), one row per setting.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './auth'
import { updatedAt } from './columns'

export const appSettings = sqliteTable(
  'app_settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: updatedAt(),
  },
  // Deleting an owner clears who changed what.
  (t) => [index('app_settings_updated_by_idx').on(t.updatedBy)],
)
