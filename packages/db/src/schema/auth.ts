// Tables managed by Better Auth. Column keys are camelCase because Better Auth
// reads them by these names; the SQL columns are snake_case.
import { EXPERIENCE_LEVELS, GOALS, ROLES, SEXES, WEIGHT_UNITS } from '@project180/shared'
import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import { createdAt, id, timestamp, updatedAt } from './columns'

export const users = sqliteTable(
  'users',
  {
    id: id(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    role: text('role', { enum: ROLES }).notNull().default('member'),
    timezone: text('timezone').notNull().default('Africa/Johannesburg'),
    weightUnit: text('weight_unit', { enum: WEIGHT_UNITS }).notNull().default('kg'),
    // The coach (owner or admin) who looks after this client. Null for staff added by script.
    coachId: integer('coach_id').references((): AnySQLiteColumn => users.id, {
      onDelete: 'set null',
    }),
    // Set when staff give someone a temporary password; cleared once they choose their own.
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    // Last time they used the app or admin (updated at most every couple of minutes).
    lastSeenAt: timestamp('last_seen_at'),
    // Food photo estimates this person may take a day; null = the site default (app_settings).
    foodPhotosPerDay: integer('food_photos_per_day'),
    // Set when staff block their access: no sign-in, no notifications; everything is kept.
    blockedAt: timestamp('blocked_at'),
    // How much water to drink a day, in ml; set by their coach or themselves. Null = no goal.
    waterGoalMl: integer('water_goal_ml'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('users_coach_idx').on(t.coachId)],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    // Which app this sign-in is for: 'app' or 'admin' (null: from before this column).
    app: text('app'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const accounts = sqliteTable(
  'accounts',
  {
    id: id(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    // Hash only; never the password itself.
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
)

export const verifications = sqliteTable(
  'verifications',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
)

/**
 * What a coach knows about a client: contact, body basics and goals. One row per person,
 * captured by the new-client wizard; the client can update their goals in the app.
 */
export const clientProfiles = sqliteTable('client_profiles', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  phone: text('phone'),
  birthDate: text('birth_date'),
  sex: text('sex', { enum: SEXES }),
  heightCm: real('height_cm'),
  goalWeightKg: real('goal_weight_kg'),
  mainGoal: text('main_goal', { enum: GOALS }),
  // JSON arrays of Goal and TrainingPlace values.
  focusAreas: text('focus_areas', { mode: 'json' }).$type<string[]>().notNull().default([]),
  places: text('places', { mode: 'json' }).$type<string[]>().notNull().default([]),
  experience: text('experience', { enum: EXPERIENCE_LEVELS }),
  daysPerWeek: integer('days_per_week'),
  targetEvent: text('target_event'),
  targetEventDate: text('target_event_date'),
  // Injuries, limitations, anything the coach should know.
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
