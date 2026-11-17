// Invitations (a coach invites someone by email), the record of who did what (the platform
// admin's audit list) and the errors the site ran into (for alerts).
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './auth'
import { businesses } from './businesses'
import { createdAt, id, timestamp } from './columns'

export const INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'cancelled'] as const

/**
 * A coach invites someone by email to be their client. Someone already training on their own
 * accepts in the app and joins the business with all their history; someone new signs up from
 * the link. Only a SHA-256 hash of the link's token is stored.
 */
export const invitations = sqliteTable(
  'invitations',
  {
    id: id(),
    businessId: integer('business_id')
      .notNull()
      .references(() => businesses.id, { onDelete: 'cascade' }),
    // The coach the person will have.
    coachId: integer('coach_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    status: text('status', { enum: INVITATION_STATUSES }).notNull().default('pending'),
    expiresAt: timestamp('expires_at').notNull(),
    acceptedUserId: integer('accepted_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    answeredAt: timestamp('answered_at'),
    createdAt: createdAt(),
  },
  (t) => [
    // The Clients page lists a business's pending invitations.
    index('invitations_business_status_idx').on(t.businessId, t.status),
    // The app finds invitations waiting for the signed-in email.
    index('invitations_email_status_idx').on(t.email, t.status),
    index('invitations_coach_idx').on(t.coachId),
    index('invitations_accepted_user_idx').on(t.acceptedUserId),
  ],
)

/**
 * Who did what: account changes, sign-ups, invitations and platform settings. Never anyone's
 * training, food or chat. Names are kept as they were at the time (a history snapshot), so the
 * line still reads after someone is deleted; emails are never stored here.
 */
export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: id(),
    businessId: integer('business_id').references(() => businesses.id, { onDelete: 'set null' }),
    actorId: integer('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: text('actor_name'),
    action: text('action').notNull(),
    targetId: integer('target_id').references(() => users.id, { onDelete: 'set null' }),
    targetName: text('target_name'),
    // A short note (a role, a coach's name, a setting), never personal health data.
    detail: text('detail'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_events_created_idx').on(t.createdAt),
    index('audit_events_business_created_idx').on(t.businessId, t.createdAt),
    index('audit_events_actor_idx').on(t.actorId),
    index('audit_events_target_idx').on(t.targetId),
  ],
)

export const ERROR_SOURCES = ['api', 'email', 'push', 'cron'] as const

/** Something that went wrong (a crash, an email that didn't send). Kept 30 days. */
export const errorEvents = sqliteTable(
  'error_events',
  {
    id: id(),
    source: text('source', { enum: ERROR_SOURCES }).notNull(),
    // e.g. "POST /api/me/food" or "email: Confirm your email".
    where: text('where').notNull(),
    message: text('message').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('error_events_created_idx').on(t.createdAt)],
)
