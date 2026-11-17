// What the platform admin controls about Claude: which features may call it, the model each
// uses, the hard daily limits, and what every call costs. Prices are USD per million tokens,
// from Anthropic's pricing page (November 2026); a call's cost is worked out when it's made
// and saved with it, so old totals stay right when prices change.
import { z } from 'zod'

/** The parts of the app that call Claude. */
export const CLAUDE_FEATURES = ['food_photo', 'workout_builder', 'program_builder'] as const
export type ClaudeFeature = (typeof CLAUDE_FEATURES)[number]
export const CLAUDE_FEATURE_LABELS: Record<ClaudeFeature, string> = {
  food_photo: 'Food photos',
  workout_builder: 'Workout builder',
  program_builder: 'Program builder',
}
/** Who the daily limit counts for, for the labels. */
export const CLAUDE_LIMIT_UNITS: Record<ClaudeFeature, string> = {
  food_photo: 'photos per person per day',
  workout_builder: 'workouts per coach per day',
  program_builder: 'programs per coach per day',
}

/** How a call ended. */
export const CLAUDE_OUTCOMES = ['ok', 'not_food', 'failed'] as const
export type ClaudeOutcome = (typeof CLAUDE_OUTCOMES)[number]

interface ModelPrice {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface ClaudeModel {
  id: string
  label: string
  /** USD per million tokens. */
  price: ModelPrice
  /** Haiku 5.5 charges more once a prompt is over this many tokens. */
  longPrompt?: { over: number; price: ModelPrice }
}

/** The models the platform admin can pick from, cheapest first. */
export const CLAUDE_MODELS: readonly ClaudeModel[] = [
  {
    id: 'claude-haiku-5-5',
    label: 'Haiku 5.5 (cheapest)',
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
    longPrompt: {
      over: 100_000,
      price: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 },
    },
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Sonnet 5.5 (balanced)',
    price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  },
  {
    id: 'claude-opus-5-5',
    label: 'Opus 5.5 (most capable)',
    price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
]
export const CLAUDE_MODEL_IDS = CLAUDE_MODELS.map((m) => m.id)
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5'

/** Hard daily limits when the platform admin hasn't set one. */
export const DEFAULT_CLAUDE_LIMITS: Record<ClaudeFeature, number> = {
  food_photo: 50,
  workout_builder: 20,
  program_builder: 10,
}
/** The most the platform admin can allow a day, per feature. */
export const MAX_CLAUDE_LIMIT = 500

/** Tokens a call used, as Claude reports them in `usage`. */
export interface ClaudeUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/**
 * What a call cost, in millionths of a US dollar (whole numbers add up exactly), or null for a
 * model we have no price for (the tokens are still saved).
 */
export function claudeCostMicros(model: string, usage: ClaudeUsage): number | null {
  const m = CLAUDE_MODELS.find((x) => x.id === model)
  if (!m) return null
  const prompt = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const p = m.longPrompt && prompt > m.longPrompt.over ? m.longPrompt.price : m.price
  // tokens × USD per million tokens = millionths of a dollar.
  return Math.round(
    usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite,
  )
}

/** "$0.0123" under a dollar (scans are fractions of a cent), "$12.34" from there. */
export function formatUsd(micros: number): string {
  const usd = micros / 1_000_000
  if (usd === 0) return '$0'
  if (usd < 1) return `$${usd.toFixed(usd < 0.01 ? 4 : 3)}`
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Reads Claude's `usage` block; anything missing counts as 0. */
export function readClaudeUsage(raw: unknown): ClaudeUsage {
  const u = (raw ?? {}) as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  return {
    inputTokens: n(u.input_tokens),
    outputTokens: n(u.output_tokens),
    cacheReadTokens: n(u.cache_read_input_tokens),
    cacheWriteTokens: n(u.cache_creation_input_tokens),
  }
}

/** One feature as the platform admin sees and sets it. */
export interface ClaudeFeatureConfig {
  feature: ClaudeFeature
  /** Switched on for everyone (on unless the platform admin turned it off). */
  enabled: boolean
  /** The model it uses now. */
  model: string
  /** Hard limit a day (see CLAUDE_LIMIT_UNITS); nobody goes past it, owners included. */
  limitPerDay: number
  updatedAt: string | null
}

export interface ClaudeConfig {
  /** ANTHROPIC_API_KEY is set on this site; nothing calls Claude without it. */
  configured: boolean
  features: ClaudeFeatureConfig[]
}

/** The platform admin changes one feature: switch, model, limit or any of them. */
export const claudeFeatureUpdate = z
  .object({
    feature: z.enum(CLAUDE_FEATURES),
    enabled: z.boolean().optional(),
    model: z
      .string()
      .refine((m) => CLAUDE_MODEL_IDS.includes(m), 'Pick one of the listed models')
      .optional(),
    limitPerDay: z.number().int().min(0).max(MAX_CLAUDE_LIMIT).optional(),
  })
  .refine(
    (v) => v.enabled !== undefined || v.model !== undefined || v.limitPerDay !== undefined,
    'Nothing to change',
  )

/** Calls and spend for one feature over a period. */
export interface ClaudeSpendRow {
  feature: ClaudeFeature
  calls: number
  failed: number
  costMicros: number
  inputTokens: number
  outputTokens: number
  /** Average seconds Claude took, successful calls only. */
  avgMs: number | null
}

export interface ClaudeCosts {
  /** This month so far (Johannesburg time), per feature. */
  month: ClaudeSpendRow[]
  /** Last month, per feature, to compare. */
  lastMonth: ClaudeSpendRow[]
  /** The last 30 days, one entry per day with any calls. */
  days: Array<{ date: string; calls: number; costMicros: number }>
  /** Who used the most this month. */
  topUsers: Array<{
    userId: number | null
    name: string
    role: string | null
    calls: number
    costMicros: number
  }>
  /** The latest failed calls, newest first. */
  failures: Array<{
    at: string
    feature: ClaudeFeature
    model: string
    reason: string
    requestId: string | null
  }>
}

/** One coach or owner in the platform admin's table. */
export interface PlatformCoach {
  id: number
  name: string
  email: string
  role: 'owner' | 'admin'
  /** The business they belong to. */
  businessId: number | null
  business: string | null
  clients: number
  createdAt: string
  lastSeenAt: string | null
  signedIn: boolean
  blocked: boolean
  /** Claude spend this month by them and their clients. */
  monthCalls: number
  monthCostMicros: number
}

/** Site health for the platform admin: which keys are set (never their values). */
export interface PlatformHealth {
  keys: Array<{ name: string; label: string; set: boolean; note: string }>
  /** The newest database migration applied, or null when it can't be read. */
  migration: string | null
}

/** One business in the platform admin's table. */
export interface PlatformBusiness {
  id: number
  name: string
  ownerName: string | null
  ownerEmail: string | null
  coaches: number
  clients: number
  createdAt: string
  /** The latest anyone in it used either app. */
  lastActiveAt: string | null
  monthCalls: number
  monthCostMicros: number
  /** It's the starter library. */
  starter: boolean
}

/** Everyone on the platform at a glance, and new accounts per week. */
export interface PlatformPeople {
  totals: {
    businesses: number
    coaches: number
    clients: number
    /** Clients without a coach (signed up on their own). */
    onOwn: number
    /** Signed up but haven't confirmed their email yet. */
    unconfirmed: number
    /** Anyone (not the platform admin) active in the last 7 days. */
    activeWeek: number
  }
  /** The last 12 weeks, Monday first, oldest first; weeks with nothing are included as 0. */
  weeks: Array<{ week: string; businesses: number; onOwn: number; clients: number }>
  businesses: PlatformBusiness[]
}
