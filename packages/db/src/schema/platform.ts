// What the platform admin sees: every call to Claude, with the tokens it used and what it cost.
// Never the photo, the person's note or the coach's prompt: only counts, model and outcome.
import { CLAUDE_FEATURES, CLAUDE_OUTCOMES } from '@project180/shared'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users } from './auth'
import { createdAt, id } from './columns'

/**
 * One call to the Claude API (a food photo, a workout or program build), successful or not.
 * The cost is worked out when the call is made (millionths of a US dollar), so totals stay
 * right after prices change. Deleting a person keeps the spend, without who it was.
 */
export const claudeCalls = sqliteTable(
  'claude_calls',
  {
    id: id(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    feature: text('feature', { enum: CLAUDE_FEATURES }).notNull(),
    model: text('model').notNull(),
    outcome: text('outcome', { enum: CLAUDE_OUTCOMES }).notNull(),
    // Why it failed (timeout, cut off, wrong shape, Claude's error), for the platform admin.
    failReason: text('fail_reason'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    // Null for a model without a known price.
    costMicros: integer('cost_micros'),
    durationMs: integer('duration_ms'),
    // Photos: meal or label, how many foods; builds: how many exercises or workouts.
    kind: text('kind'),
    items: integer('items'),
    // Photos: whether a note came with it (never the note itself).
    hadNote: integer('had_note', { mode: 'boolean' }),
    // Claude's request id, to look a bad answer up with Anthropic.
    requestId: text('request_id'),
    createdAt: createdAt(),
  },
  (t) => [
    // Spend by period (the Platform page) reads by time.
    index('claude_calls_created_idx').on(t.createdAt),
    // The daily limits count one person's calls to one feature since midnight.
    index('claude_calls_user_feature_created_idx').on(t.userId, t.feature, t.createdAt),
  ],
)
