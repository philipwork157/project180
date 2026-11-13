import { describe, expect, it } from 'vitest'
import {
  createUserInput,
  exerciseInput,
  exerciseUpdate,
  isoDate,
  updateProfileInput,
} from './validators'

describe('validators', () => {
  it('normalises email addresses', () => {
    const parsed = createUserInput.parse({
      name: 'Pieter',
      email: ' Pieter@Example.COM ',
      password: 'longenough',
    })
    expect(parsed.email).toBe('pieter@example.com')
  })

  it('rejects short passwords', () => {
    expect(
      createUserInput.safeParse({ name: 'A', email: 'a@b.co', password: 'short' }).success,
    ).toBe(false)
  })

  it('defaults new users to member', () => {
    const parsed = createUserInput.parse({ name: 'A', email: 'a@b.co', password: 'longenough' })
    expect(parsed.role).toBe('member')
  })

  it('fills exercise defaults', () => {
    const parsed = exerciseInput.parse({ name: 'Hip Thrust', muscleGroup: 'glutes' })
    expect(parsed).toMatchObject({
      equipment: 'other',
      trackingType: 'weight_reps',
    })
  })

  it('rejects unknown muscle groups', () => {
    expect(exerciseInput.safeParse({ name: 'X', muscleGroup: 'neck' }).success).toBe(false)
  })

  it('leaves omitted fields out of updates', () => {
    expect(exerciseUpdate.parse({ name: 'Front Squat' })).toEqual({ name: 'Front Squat' })
  })
})

describe('updateProfileInput', () => {
  it('only changes the name: time zone and weight unit are fixed', () => {
    expect(
      updateProfileInput.parse({ name: 'Sam', timezone: 'Europe/London', weightUnit: 'lb' }),
    ).toEqual({ name: 'Sam' })
  })
})

describe('isoDate', () => {
  it('accepts real dates only', () => {
    expect(isoDate.safeParse('2026-11-12').success).toBe(true)
    expect(isoDate.safeParse('2028-02-29').success).toBe(true)
    expect(isoDate.safeParse('2026-02-29').success).toBe(false)
    expect(isoDate.safeParse('2026-13-45').success).toBe(false)
    expect(isoDate.safeParse('12/11/2026').success).toBe(false)
  })
})

describe('exercise video links', () => {
  const ok = (videoUrl: string) => exerciseUpdate.safeParse({ videoUrl }).success
  it('takes https YouTube and Vimeo links only', () => {
    expect(ok('https://www.youtube.com/watch?v=abc123')).toBe(true)
    expect(ok('https://youtu.be/abc123')).toBe(true)
    expect(ok('https://vimeo.com/123456')).toBe(true)
    expect(ok('http://www.youtube.com/watch?v=abc123')).toBe(false)
    expect(ok('javascript:alert(1)')).toBe(false)
    expect(ok('https://evil.example/youtube.com')).toBe(false)
    expect(ok('https://youtube.com.evil.example/x')).toBe(false)
  })
})
