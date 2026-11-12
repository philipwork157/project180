import { describe, expect, it } from 'vitest'
import {
  generateTempPassword,
  TEMP_PASSWORD_DAYS,
  TEMP_PASSWORD_WORDS,
  tempPasswordExpired,
} from './passwords'

const DAY = 24 * 60 * 60 * 1000

describe('temporary passwords', () => {
  it('has 256 different words, so a byte picks one without bias', () => {
    expect(TEMP_PASSWORD_WORDS).toHaveLength(256)
    expect(new Set(TEMP_PASSWORD_WORDS).size).toBe(256)
  })

  it('makes four words and a three-digit number', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword()).toMatch(/^([A-Z][a-z]+-){4}[1-9]\d{2}$/)
    }
  })

  it('is long enough to pass the 8-character minimum', () => {
    expect(generateTempPassword().length).toBeGreaterThanOrEqual(8)
  })

  it('uses the random bytes it is given', () => {
    let calls = 0
    const fill = (bytes: Uint8Array) => {
      calls++
      return bytes.fill(calls === 1 ? 0 : 1)
    }
    // Words from byte 0, then the number from 0x0101 = 257 -> 100 + 257 % 900.
    const word = TEMP_PASSWORD_WORDS[0] ?? ''
    const cap = word.charAt(0).toUpperCase() + word.slice(1)
    expect(generateTempPassword(fill)).toBe(`${cap}-${cap}-${cap}-${cap}-357`)
  })

  it('rarely repeats', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateTempPassword()))
    expect(seen.size).toBe(2000)
  })

  it('expires after the allowed days', () => {
    const now = Date.UTC(2026, 10, 12)
    expect(tempPasswordExpired(new Date(now - DAY), now)).toBe(false)
    expect(tempPasswordExpired(new Date(now - TEMP_PASSWORD_DAYS * DAY), now)).toBe(false)
    expect(tempPasswordExpired(new Date(now - TEMP_PASSWORD_DAYS * DAY - 1), now)).toBe(true)
    expect(tempPasswordExpired(new Date(now - (TEMP_PASSWORD_DAYS + 1) * DAY), now)).toBe(true)
  })
})
