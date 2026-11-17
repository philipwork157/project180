import { describe, expect, it } from 'vitest'
import { claudeCostMicros, claudeFeatureUpdate, formatUsd, readClaudeUsage } from './claude'
import { canUseAdmin, isPlatform, isStaff } from './enums'

const usage = (inputTokens: number, outputTokens: number, cacheRead = 0, cacheWrite = 0) => ({
  inputTokens,
  outputTokens,
  cacheReadTokens: cacheRead,
  cacheWriteTokens: cacheWrite,
})

describe('claudeCostMicros', () => {
  it('prices a Sonnet 5.5 photo scan at $2 in / $10 out per million tokens', () => {
    // 1 800 in × $2 + 600 out × $10 = 3 600 + 6 000 millionths = $0.0096
    expect(claudeCostMicros('claude-sonnet-5-5', usage(1800, 600))).toBe(9600)
  })
  it('adds cache reads and writes at their own prices', () => {
    expect(claudeCostMicros('claude-sonnet-5-5', usage(0, 0, 1000, 1000))).toBe(200 + 2500)
  })
  it('uses Haiku 5.5’s higher price once the prompt is over 100 000 tokens', () => {
    expect(claudeCostMicros('claude-haiku-5-5', usage(1000, 1000))).toBe(100 + 500)
    expect(claudeCostMicros('claude-haiku-5-5', usage(100_001, 0))).toBe(50_001)
  })
  it('gives null for a model without a price, never a made-up number', () => {
    expect(claudeCostMicros('claude-unknown', usage(1000, 1000))).toBeNull()
  })
})

describe('readClaudeUsage', () => {
  it('reads Claude’s usage block, missing or bad values as 0', () => {
    expect(
      readClaudeUsage({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 }),
    ).toEqual(usage(10, 5, 2, 0))
    expect(readClaudeUsage(null)).toEqual(usage(0, 0))
    expect(readClaudeUsage({ input_tokens: -3, output_tokens: 'x' })).toEqual(usage(0, 0))
  })
})

describe('formatUsd', () => {
  it('shows fractions of a cent for single scans and cents for totals', () => {
    expect(formatUsd(0)).toBe('$0')
    expect(formatUsd(9600)).toBe('$0.0096')
    expect(formatUsd(123_000)).toBe('$0.123')
    expect(formatUsd(12_345_678)).toBe('$12.35')
  })
})

describe('claudeFeatureUpdate', () => {
  it('takes a listed model and a limit within range', () => {
    expect(
      claudeFeatureUpdate.safeParse({ feature: 'food_photo', model: 'claude-haiku-5-5' }).success,
    ).toBe(true)
    expect(claudeFeatureUpdate.safeParse({ feature: 'food_photo', model: 'gpt' }).success).toBe(
      false,
    )
    expect(claudeFeatureUpdate.safeParse({ feature: 'food_photo', limitPerDay: 501 }).success).toBe(
      false,
    )
    expect(claudeFeatureUpdate.safeParse({ feature: 'food_photo' }).success).toBe(false)
  })
})

describe('platform role', () => {
  it('can use the admin but is never staff', () => {
    expect(canUseAdmin('platform')).toBe(true)
    expect(isStaff('platform')).toBe(false)
    expect(isPlatform('platform')).toBe(true)
    expect(canUseAdmin('member')).toBe(false)
  })
})
