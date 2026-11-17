// Every call to Claude is saved with its tokens and cost (claude_calls), for the platform admin's
// Platform page and the hard daily limits. Never the photo, the note or the prompt.
import { claudeCalls, type Db } from '@project180/db'
import {
  CLAUDE_FEATURE_LABELS,
  type ClaudeFeature,
  type ClaudeOutcome,
  type ClaudeUsage,
  claudeCostMicros,
  todayIn,
} from '@project180/shared'
import { and, count, eq, gte } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

/**
 * Filled in while a call runs, then saved, whether it worked or not. The feature code sets
 * what it learns (usage from Claude's answer, why it failed, what it found).
 */
export interface ClaudeMeter {
  model: string
  usage?: ClaudeUsage
  requestId?: string | null
  durationMs?: number
  outcome?: ClaudeOutcome
  failReason?: string
  kind?: string
  items?: number
  hadNote?: boolean
}

/** Saves one call. A failure here is logged and never breaks the answer to the person. */
export async function recordClaudeCall(
  db: Db,
  userId: number,
  feature: ClaudeFeature,
  meter: ClaudeMeter,
) {
  const usage = meter.usage ?? {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  }
  try {
    await db.insert(claudeCalls).values({
      userId,
      feature,
      model: meter.model,
      outcome: meter.outcome ?? 'failed',
      failReason:
        meter.outcome === 'failed' || !meter.outcome ? (meter.failReason ?? 'unknown') : null,
      ...usage,
      costMicros: claudeCostMicros(meter.model, usage),
      durationMs: meter.durationMs ?? null,
      kind: meter.kind ?? null,
      items: meter.items ?? null,
      hadNote: meter.hadNote ?? null,
      requestId: meter.requestId ?? null,
    })
  } catch (err) {
    console.error('[claude-calls] could not save a call', err)
  }
}

/**
 * Midnight today in Johannesburg (the only time zone we use, UTC+2 all year), as a Date, so
 * the daily limits reset at the person's own midnight.
 */
export function startOfToday(now = new Date()): Date {
  return new Date(`${todayIn('Africa/Johannesburg', now)}T00:00:00+02:00`)
}

/** How many calls this person made to a feature today. Uses claude_calls_user_feature_created_idx. */
export async function claudeCallsToday(db: Db, userId: number, feature: ClaudeFeature) {
  const [row] = await db
    .select({ n: count() })
    .from(claudeCalls)
    .where(
      and(
        eq(claudeCalls.userId, userId),
        eq(claudeCalls.feature, feature),
        gte(claudeCalls.createdAt, startOfToday()),
      ),
    )
  return row?.n ?? 0
}

/** 429 once this person reached today's hard limit for a builder. */
export async function assertWithinClaudeLimit(
  db: Db,
  userId: number,
  feature: ClaudeFeature,
  limitPerDay: number,
) {
  if ((await claudeCallsToday(db, userId, feature)) < limitPerDay) return
  throw new HTTPException(429, {
    message:
      limitPerDay === 0
        ? `${CLAUDE_FEATURE_LABELS[feature]} is switched off at the moment.`
        : `You’ve reached today’s limit for the ${CLAUDE_FEATURE_LABELS[feature].toLowerCase()} (${limitPerDay} a day). Try again tomorrow.`,
  })
}
