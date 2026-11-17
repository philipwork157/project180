// One-time links sent by email: confirming a new account's address, and resetting a forgotten
// password. Only a SHA-256 hash of each token is stored, so a copy of the database can't be
// used to take over an account.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './auth'
import { createdAt, id, timestamp } from './columns'

export const EMAIL_TOKEN_PURPOSES = ['verify', 'reset'] as const

export const emailTokens = sqliteTable(
  'email_tokens',
  {
    id: id(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', { enum: EMAIL_TOKEN_PURPOSES }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: createdAt(),
  },
  // A new link replaces that person's older ones of the same kind.
  (t) => [index('email_tokens_user_purpose_idx').on(t.userId, t.purpose)],
)
