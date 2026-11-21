import { env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import { emailMode, sendEmail, sigV4Key } from '../src/email'
import { ADMIN, call, createAdmin, signIn } from './helpers'

type Json = Record<string, any>

const SAM = { name: 'Sam Runner', email: 'sam@example.com', password: 'sam-password-1' }

async function owner() {
  await createAdmin()
  return signIn(ADMIN.email, ADMIN.password)
}

describe('new client wizard', () => {
  it('creates the account, profile, first weigh-in and welcome email in one go', async () => {
    const cookie = await owner()
    const res = await call<Json>('/admin/users', {
      method: 'POST',
      cookie,
      body: {
        ...SAM,
        currentWeightKg: 82.5,
        sendWelcome: true,
        profile: {
          phone: '082 555 0101',
          birthDate: '1990-04-12',
          heightCm: 181,
          goalWeightKg: 76,
          mainGoal: 'running',
          focusAreas: ['running', 'mobility'],
          places: ['outdoors', 'gym'],
          experience: 'intermediate',
          daysPerWeek: 4,
          targetEvent: 'Half marathon',
          targetEventDate: '2027-03-15',
          notes: 'Old left knee niggle',
        },
      },
    })
    expect(res.status).toBe(201)
    // No AWS keys in tests: the email is logged, not sent.
    expect(res.data.email).toMatchObject({ status: 'logged', to: SAM.email })

    const profile = await call<Json>(`/admin/users/${res.data.user.id}/profile`, { cookie })
    expect(profile.data.profile).toMatchObject({
      heightCm: 181,
      mainGoal: 'running',
      // The main goal isn't repeated as an extra focus area.
      focusAreas: ['mobility'],
      targetEvent: 'Half marathon',
      latestWeightKg: 82.5,
    })
  })

  it('refuses a bad program or coach before creating anything, so trying again works', async () => {
    const cookie = await owner()
    const program = { programId: 999_999, startDate: '2026-11-16' }
    const bad = await call<Json>('/admin/users', {
      method: 'POST',
      cookie,
      body: { ...SAM, program, currentWeightKg: 80 },
    })
    expect(bad.status).toBe(404)
    const noCoach = await call<Json>('/admin/users', {
      method: 'POST',
      cookie,
      body: { ...SAM, coachId: 999_999 },
    })
    expect(noCoach.status).toBe(404)
    // Nothing was made: no account, so the same email works on the next try.
    const users = await call<Json>('/admin/users', { cookie })
    expect(users.data.users.map((u: Json) => u.email)).not.toContain(SAM.email)
    const retry = await call<Json>('/admin/users', { method: 'POST', cookie, body: SAM })
    expect(retry.status).toBe(201)
    const taken = await call<Json>('/admin/users', { method: 'POST', cookie, body: SAM })
    expect(taken.status).toBe(409)
  })

  it('lets clients see and update their own goals', async () => {
    const cookie = await owner()
    await call('/admin/users', { method: 'POST', cookie, body: SAM })
    const sam = await signIn(SAM.email, SAM.password)
    const put = await call<Json>('/me/profile', {
      method: 'PUT',
      cookie: sam,
      body: { mainGoal: 'triathlon', daysPerWeek: 5, places: ['outdoors'] },
    })
    expect(put.status).toBe(200)
    expect(put.data.profile).toMatchObject({ mainGoal: 'triathlon', daysPerWeek: 5 })
  })

  it('saves a race goal and endurance numbers that only the coach can change', async () => {
    const cookie = await owner()
    const created = await call<Json>('/admin/users', { method: 'POST', cookie, body: SAM })
    const id = created.data.user.id
    const race = {
      mainGoal: 'running',
      focusAreas: ['cycling'],
      targetEvent: 'Two Oceans',
      targetEventDate: '2027-04-17',
      raceKind: 'half_marathon',
      goalTimeSeconds: 6300,
      bestTimeSeconds: 6730,
      maxHr: 188,
      restingHr: 52,
      thresholdPaceSeconds: 270,
      ftpWatts: 240,
    }
    const saved = await call<Json>(`/admin/users/${id}/profile`, {
      method: 'PUT',
      cookie,
      body: race,
    })
    expect(saved.status).toBe(200)
    expect(saved.data.profile).toMatchObject(race)

    // The client saving their goals from the app can't change the coach's numbers.
    const sam = await signIn(SAM.email, SAM.password)
    const put = await call<Json>('/me/profile', {
      method: 'PUT',
      cookie: sam,
      body: { mainGoal: 'trail_running', raceKind: 'marathon', maxHr: 200, ftpWatts: null },
    })
    expect(put.status).toBe(200)
    expect(put.data.profile).toMatchObject({
      mainGoal: 'trail_running',
      raceKind: 'half_marathon',
      goalTimeSeconds: 6300,
      maxHr: 188,
      ftpWatts: 240,
    })

    // Left out keeps what's saved; null clears it.
    const cleared = await call<Json>(`/admin/users/${id}/profile`, {
      method: 'PUT',
      cookie,
      body: { mainGoal: 'running', ftpWatts: null },
    })
    expect(cleared.data.profile).toMatchObject({ maxHr: 188, ftpWatts: null })

    // Impossible numbers are refused.
    const bad = await call<Json>(`/admin/users/${id}/profile`, {
      method: 'PUT',
      cookie,
      body: { maxHr: 400 },
    })
    expect(bad.status).toBe(400)
  })

  it("keeps a client's profile away from other coaches", async () => {
    const cookie = await owner()
    await call('/admin/users', {
      method: 'POST',
      cookie,
      body: {
        name: 'Coach Kim',
        email: 'kim@example.com',
        password: 'coach-password-1',
        role: 'admin',
      },
    })
    const created = await call<Json>('/admin/users', { method: 'POST', cookie, body: SAM })
    const kim = await signIn('kim@example.com', 'coach-password-1')
    expect(
      (await call(`/admin/users/${created.data.user.id}/profile`, { cookie: kim })).status,
    ).toBe(404)
  })
})

describe('email', () => {
  const message = { to: 'client@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' }

  it('in dev, sends everything to the developer address instead, marked with who it was for', async () => {
    const result = await sendEmail(
      { ...env, EMAIL_REDIRECT_TO: 'philipwork157@gmail.com' },
      message,
    )
    expect(result).toEqual({ status: 'logged', to: 'philipwork157@gmail.com' })
  })

  it('signs SES requests with AWS Signature V4 (AWS published example key)', async () => {
    const key = await sigV4Key(
      'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      '20120215',
      'us-east-1',
      'iam',
    )
    const hex = [...new Uint8Array(key)].map((b) => b.toString(16).padStart(2, '0')).join('')
    expect(hex).toBe('f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d')
  })

  it('on a local or dev site without a redirect, never emails real people, even with AWS keys', async () => {
    const keys = {
      AWS_ACCESS_KEY_ID: 'x',
      AWS_SECRET_ACCESS_KEY: 'y',
      EMAIL_FROM: 'Project 180 <a@b.co>',
    }
    const result = await sendEmail({ ...env, ...keys, EMAIL_REDIRECT_TO: undefined }, message)
    expect(result).toEqual({ status: 'logged', to: 'client@example.com' })
    expect(emailMode({ ...env, ...keys, EMAIL_REDIRECT_TO: undefined }).mode).toBe('blocked')
    expect(emailMode({ ...env, ...keys, EMAIL_REDIRECT_TO: 'dev@example.com' })).toMatchObject({
      mode: 'redirect',
      redirectTo: 'dev@example.com',
    })
    expect(
      emailMode({
        ...env,
        ...keys,
        BETTER_AUTH_URL: 'https://project180.co.za',
        EMAIL_REDIRECT_TO: undefined,
      }).mode,
    ).toBe('live')
  })

  it('without AWS keys, only logs (never throws)', async () => {
    expect(await sendEmail(env, message)).toEqual({ status: 'logged', to: 'client@example.com' })
  })

  it('never writes the email body (temporary passwords) to the logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const secret = { ...message, text: 'Temporary password: Cedar-Otter-Kayak-Lark-482' }
    const live = {
      ...env,
      BETTER_AUTH_URL: 'https://project180.co.za',
      EMAIL_REDIRECT_TO: undefined,
    }
    try {
      await sendEmail(env, secret)
      await sendEmail(live, secret)
      await sendEmail({ ...env, EMAIL_REDIRECT_TO: 'dev@example.com' }, secret)
      const written = log.mock.calls.flat().join('\n')
      expect(written).toContain('client@example.com')
      expect(written).not.toContain('Cedar-Otter-Kayak-Lark-482')
    } finally {
      log.mockRestore()
    }
  })
})

describe('workout parts and endurance targets', () => {
  it('keeps warm-up / cool-down and distance, pace and zone through to the session', async () => {
    const cookie = await owner()
    const mk = async (name: string, body: Json) =>
      (await call<Json>('/exercises', { method: 'POST', cookie, body: { name, ...body } })).data
        .exercise
    const jog = await mk('Easy jog', {
      muscleGroup: 'cardio',
      category: 'cardio',
      trackingType: 'distance_time',
    })
    const stretch = await mk('Hamstring stretch', {
      muscleGroup: 'legs',
      category: 'mobility',
      trackingType: 'time',
    })
    expect(jog.category).toBe('cardio')
    const w = await call<Json>('/workouts', {
      method: 'POST',
      cookie,
      body: {
        name: '5 km easy',
        exercises: [
          {
            exerciseId: jog.id,
            targetSets: 1,
            section: 'main',
            targetDistanceM: 5000,
            targetPaceSeconds: 360,
            targetHrZone: 2,
          },
          { exerciseId: stretch.id, targetSets: 2, targetSeconds: 45, section: 'cool_down' },
        ],
      },
    })
    expect(w.status).toBe(201)
    const s = await call<Json>('/sessions', {
      method: 'POST',
      cookie,
      body: { clientUuid: crypto.randomUUID(), workoutId: w.data.workout.id },
    })
    expect(s.data.session.exercises).toEqual([
      expect.objectContaining({
        section: 'main',
        targetDistanceM: 5000,
        targetPaceSeconds: 360,
        targetHrZone: 2,
      }),
      expect.objectContaining({ section: 'cool_down', targetSeconds: 45 }),
    ])
  })
})
