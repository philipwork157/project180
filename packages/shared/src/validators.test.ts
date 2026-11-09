import { describe, expect, it } from 'vitest'
import { createUserInput, exerciseInput, exerciseUpdate, updateProfileInput } from './validators'

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
  it('only accepts real time zones', () => {
    expect(updateProfileInput.safeParse({ timezone: 'Africa/Johannesburg' }).success).toBe(true)
    expect(updateProfileInput.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false)
  })
})
