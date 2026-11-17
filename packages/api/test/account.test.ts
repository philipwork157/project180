// Signing up yourself (phone app: on your own; admin: a coach with a new business), confirming
// the email, resetting a password, and what people without a coach can use.
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { call, createAdmin, signIn, signInPlatform } from './helpers'

type Json = Record<string, any>

const ME = { name: 'Sam Solo', email: 'sam@example.com', password: 'solo-password-1' }
const COACH = { name: 'Cara', email: 'cara@coach.example', password: 'coach-password-1' }
const STARTER = { name: 'Lib', email: 'lib@example.com', password: 'starter-password-1' }

const tokenOf = (link: string) => new URL(link).searchParams.get('token') as string

const signUp = (body: Json, asAdminApp = false) =>
  call<Json>('/account/signup', {
    method: 'POST',
    body: { acceptTerms: true, ...body },
    asAdminApp,
  })

const trySignIn = (email: string, password: string, asAdminApp = false) =>
  call<Json>('/auth/sign-in/email', { method: 'POST', body: { email, password }, asAdminApp })

/** A starter library business with one exercise, one recipe and one program, picked as the starter. */
async function starterLibrary() {
  await createAdmin(STARTER, 'owner', 'Starter library')
  const cookie = await signIn(STARTER.email, STARTER.password)
  const exercise = await call<Json>('/exercises', {
    method: 'POST',
    cookie,
    body: { name: 'Goblet Squat', muscleGroup: 'quads', equipment: 'dumbbell' },
  })
  const exerciseId = exercise.data.exercise.id as number
  const workout = await call<Json>('/workouts', {
    method: 'POST',
    cookie,
    body: { name: 'Legs', exercises: [{ exerciseId, targetSets: 3 }] },
  })
  const program = await call<Json>('/programs', {
    method: 'POST',
    cookie,
    body: {
      name: 'Beginner 4 weeks',
      durationWeeks: 4,
      days: [{ weekNumber: 1, dayNumber: 1, workoutId: workout.data.workout.id }],
    },
  })
  await call('/recipes', {
    method: 'POST',
    cookie,
    body: {
      title: 'Starter oats',
      summary: null,
      meal: 'breakfast',
      servings: 1,
      prepMinutes: 5,
      cookMinutes: 0,
      kcal: 400,
      proteinG: 30,
      carbsG: 50,
      fatG: 8,
      ingredients: [{ amount: 50, unit: 'g', name: 'oats' }],
      steps: ['Mix.'],
      tips: null,
      sourceName: null,
      sourceUrl: null,
    },
  })
  const businessId = (
    await env.DB.prepare('SELECT id FROM businesses WHERE name = ?')
      .bind('Starter library')
      .first<{ id: number }>()
  )?.id as number
  const platform = await signInPlatform()
  const set = await call('/platform/starter', {
    method: 'PUT',
    cookie: platform,
    asAdminApp: true,
    body: { businessId },
  })
  expect(set.status).toBe(200)
  return { exerciseId, programId: program.data.program.id as number, businessId }
}

describe('signing up on the phone app', () => {
  it('makes someone on their own, who confirms their email before signing in', async () => {
    const res = await signUp(ME)
    expect(res.status).toBe(201)
    expect(res.data.email).toBe(ME.email)
    const row = await env.DB.prepare(
      'SELECT role, business_id, coach_id, email_verified, quick_workouts FROM users WHERE email = ?',
    )
      .bind(ME.email)
      .first<Json>()
    expect(row).toMatchObject({
      role: 'member',
      business_id: null,
      coach_id: null,
      email_verified: 0,
      quick_workouts: 1,
    })

    const early = await trySignIn(ME.email, ME.password)
    expect(early.status).toBe(403)
    expect(early.data.code).toBe('EMAIL_NOT_VERIFIED')

    const verified = await call<Json>('/account/verify', {
      method: 'POST',
      body: { token: tokenOf(res.data.link) },
    })
    expect(verified.status).toBe(200)
    expect((await trySignIn(ME.email, ME.password)).status).toBe(200)
    // The link works once.
    const again = await call('/account/verify', {
      method: 'POST',
      body: { token: tokenOf(res.data.link) },
    })
    expect(again.status).toBe(400)
  })

  it('refuses a taken email and a business name, and never makes staff', async () => {
    expect((await signUp(ME)).status).toBe(201)
    expect((await signUp(ME)).status).toBe(409)
    const row = await env.DB.prepare('SELECT role FROM users WHERE email = ?')
      .bind(ME.email)
      .first<Json>()
    expect(row?.role).toBe('member')
  })

  it('a new link replaces the old one', async () => {
    const first = await signUp(ME)
    const resent = await call<Json>('/account/resend', {
      method: 'POST',
      body: { email: ME.email },
    })
    expect(resent.status).toBe(200)
    expect(
      (await call('/account/verify', { method: 'POST', body: { token: tokenOf(first.data.link) } }))
        .status,
    ).toBe(400)
    expect(
      (
        await call('/account/verify', {
          method: 'POST',
          body: { token: tokenOf(resent.data.link) },
        })
      ).status,
    ).toBe(200)
  })
})

describe('signing up as a coach in the admin', () => {
  it('needs a business name, makes an owner of a new business with the starter library copied', async () => {
    const starter = await starterLibrary()
    expect((await signUp(COACH, true)).status).toBe(400)
    const res = await signUp({ ...COACH, businessName: 'Cara Coaching' }, true)
    expect(res.status).toBe(201)
    await call('/account/verify', { method: 'POST', body: { token: tokenOf(res.data.link) } })
    const signed = await trySignIn(COACH.email, COACH.password, true)
    expect(signed.status).toBe(200)
    const cookie = await signIn(COACH.email, COACH.password)

    const me = await call<Json>('/me', { cookie })
    expect(me.data.user).toMatchObject({ role: 'owner' })
    expect(me.data.user.businessId).not.toBe(starter.businessId)
    // Their own copy: same exercise, a different row, theirs to change.
    const list = await call<Json>('/exercises', { cookie })
    const copy = list.data.exercises.find((e: Json) => e.name === 'Goblet Squat')
    expect(copy).toBeTruthy()
    expect(copy.id).not.toBe(starter.exerciseId)
    const renamed = await call(`/exercises/${copy.id}`, {
      method: 'PATCH',
      cookie,
      body: { name: 'Goblet Squat (Cara)' },
    })
    expect(renamed.status).toBe(200)
    const original = await env.DB.prepare('SELECT name FROM exercises WHERE id = ?')
      .bind(starter.exerciseId)
      .first<Json>()
    expect(original?.name).toBe('Goblet Squat')
    const recipes = await call<Json>('/recipes', { cookie })
    expect(recipes.data.recipes.map((r: Json) => r.title)).toEqual(['Starter oats'])
    // The starter workouts too, pointing at their own copies of the exercises.
    const workouts = await call<Json>('/workouts', { cookie })
    const legs = workouts.data.workouts.find((w: Json) => w.name === 'Legs')
    expect(legs).toBeTruthy()
    const detail = await call<Json>(`/workouts/${legs.id}`, { cookie })
    expect(detail.data.workout.exercises.map((e: Json) => e.exerciseId)).toEqual([copy.id])
    // Never the starter library's people.
    const people = await call<Json>('/admin/users', { cookie })
    expect(people.data.users.map((u: Json) => u.email)).toEqual([COACH.email])
  })
})

describe('forgot password', () => {
  it('answers the same for unknown emails, and a link resets the password once', async () => {
    await createAdmin(COACH, 'owner', 'Cara Coaching')
    const unknown = await call<Json>('/account/forgot', {
      method: 'POST',
      body: { email: 'nobody@example.com' },
    })
    expect(unknown.status).toBe(200)
    expect(unknown.data.link).toBeUndefined()

    const sent = await call<Json>('/account/forgot', {
      method: 'POST',
      body: { email: COACH.email },
    })
    expect(sent.status).toBe(200)
    const token = tokenOf(sent.data.link)
    const short = await call('/account/reset', {
      method: 'POST',
      body: { token, password: 'short' },
    })
    expect(short.status).toBe(400)
    const reset = await call('/account/reset', {
      method: 'POST',
      body: { token, password: 'brand-new-password-1' },
    })
    expect(reset.status).toBe(200)
    expect((await trySignIn(COACH.email, COACH.password, true)).status).toBe(401)
    expect((await trySignIn(COACH.email, 'brand-new-password-1', true)).status).toBe(200)
    const reused = await call('/account/reset', {
      method: 'POST',
      body: { token, password: 'another-password-1' },
    })
    expect(reused.status).toBe(400)
  })
})

describe('on your own in the app', () => {
  async function solo() {
    const res = await signUp(ME)
    await call('/account/verify', { method: 'POST', body: { token: tokenOf(res.data.link) } })
    return signIn(ME.email, ME.password)
  }

  it('reads the starter library, starts a starter program and builds quick workouts', async () => {
    const starter = await starterLibrary()
    const cookie = await solo()
    const recipes = await call<Json>('/recipes', { cookie })
    expect(recipes.data.recipes.map((r: Json) => r.title)).toEqual(['Starter oats'])

    const programs = await call<Json>('/me/starter-programs', { cookie })
    expect(programs.data.programs).toEqual([
      expect.objectContaining({ id: starter.programId, durationWeeks: 4, daysPerWeek: 1 }),
    ])
    const started = await call(`/me/starter-programs/${starter.programId}/start`, {
      method: 'POST',
      cookie,
      body: { startDate: new Date().toISOString().slice(0, 10) },
    })
    expect(started.status).toBe(201)
    const plan = await call<Json>('/me/plan', { cookie })
    expect(plan.data.plan?.enrollment.programName).toBe('Beginner 4 weeks')

    const quick = await call('/sessions/quick', {
      method: 'POST',
      cookie,
      body: {
        clientUuid: crypto.randomUUID(),
        name: 'Quick · Legs',
        exercises: [{ exerciseId: starter.exerciseId, targetSets: 3 }],
      },
    })
    expect(quick.status).toBe(201)
  })

  it('sets their own targets; a coach’s client can’t', async () => {
    const cookie = await solo()
    const body = { kcal: 2100, proteinG: 150 }
    const own = await call<Json>('/me/nutrition-targets', { method: 'PUT', cookie, body })
    expect(own.status).toBe(200)
    expect(own.data.targets).toMatchObject({ kcal: 2100, proteinG: 150 })

    await createAdmin(COACH, 'owner', 'Cara Coaching')
    const owner = await signIn(COACH.email, COACH.password)
    const client = { name: 'Kim', email: 'kim@example.com', password: 'client-password-1' }
    await call('/admin/users', { method: 'POST', cookie: owner, body: client })
    const coached = await signIn(client.email, client.password)
    const refused = await call('/me/nutrition-targets', { method: 'PUT', cookie: coached, body })
    expect(refused.status).toBe(403)
    expect((await call<Json>('/me/starter-programs', { cookie: coached })).data.programs).toEqual(
      [],
    )
  })

  it('sees nothing of any business without a starter library', async () => {
    await createAdmin(COACH, 'owner', 'Cara Coaching')
    const owner = await signIn(COACH.email, COACH.password)
    await call('/exercises', {
      method: 'POST',
      cookie: owner,
      body: { name: 'Private Press', muscleGroup: 'chest', equipment: 'dumbbell' },
    })
    const cookie = await solo()
    const recipes = await call<Json>('/recipes', { cookie })
    expect(recipes.data.recipes).toEqual([])
    expect((await call<Json>('/me/starter-programs', { cookie })).data.programs).toEqual([])
  })
})

describe('the welcome wizard', () => {
  it('is only ever for people who signed up themselves, and ends once done', async () => {
    const res = await signUp(ME)
    await call('/account/verify', { method: 'POST', body: { token: tokenOf(res.data.link) } })
    const solo = await signIn(ME.email, ME.password)
    expect((await call<Json>('/me', { cookie: solo })).data.user.needsOnboarding).toBe(true)
    const done = await call<Json>('/me/onboarding/done', { method: 'POST', cookie: solo })
    expect(done.data.user.needsOnboarding).toBe(false)
    expect((await call<Json>('/me', { cookie: solo })).data.user.needsOnboarding).toBe(false)

    // A client their coach added never sees it, nor does the coach.
    await createAdmin(COACH, 'owner', 'Cara Coaching')
    const owner = await signIn(COACH.email, COACH.password)
    const client = { name: 'Kim', email: 'kim@example.com', password: 'client-password-1' }
    await call('/admin/users', { method: 'POST', cookie: owner, body: client })
    const coached = await signIn(client.email, client.password)
    expect((await call<Json>('/me', { cookie: coached })).data.user.needsOnboarding).toBe(false)
    expect((await call<Json>('/me', { cookie: owner })).data.user.needsOnboarding).toBe(false)
  })
})

describe('who edits goal weight and activity', () => {
  it('people on their own edit theirs; a coach’s client can’t change what the coach set', async () => {
    const res = await signUp(ME)
    await call('/account/verify', { method: 'POST', body: { token: tokenOf(res.data.link) } })
    const solo = await signIn(ME.email, ME.password)
    const body = { goalWeightKg: 70, activityLevel: 'active', heightCm: 172 }
    const own = await call<Json>('/me/profile', { method: 'PUT', cookie: solo, body })
    expect(own.data.profile).toMatchObject({ goalWeightKg: 70, activityLevel: 'active' })

    await createAdmin(COACH, 'owner', 'Cara Coaching')
    const owner = await signIn(COACH.email, COACH.password)
    const client = { name: 'Kim', email: 'kim@example.com', password: 'client-password-1' }
    const added = await call<Json>('/admin/users', { method: 'POST', cookie: owner, body: client })
    await call(`/admin/users/${added.data.user.id}/nutrition-targets`, {
      method: 'PUT',
      cookie: owner,
      body: {
        kcal: 2000,
        proteinG: 140,
        plan: { activityLevel: 'light', weeklyChangeKg: -0.5, goalWeightKg: 80 },
      },
    })
    const coached = await signIn(client.email, client.password)
    const tried = await call<Json>('/me/profile', { method: 'PUT', cookie: coached, body })
    expect(tried.data.profile).toMatchObject({ goalWeightKg: 80, activityLevel: 'light' })
    // Their own height is still theirs to fill in.
    expect(tried.data.profile.heightCm).toBe(172)
  })
})

describe('terms and deleting your account', () => {
  it('needs the terms ticked at sign-up and records when', async () => {
    const refused = await call('/account/signup', { method: 'POST', body: ME })
    expect(refused.status).toBe(400)
    expect((await signUp(ME)).status).toBe(201)
    const row = await env.DB.prepare('SELECT terms_accepted_at AS at FROM users WHERE email = ?')
      .bind(ME.email)
      .first<Json>()
    expect(row?.at).toBeGreaterThan(0)
  })

  it('lets a client delete themselves with their password, and nobody else', async () => {
    const res = await signUp(ME)
    await call('/account/verify', { method: 'POST', body: { token: tokenOf(res.data.link) } })
    const cookie = await signIn(ME.email, ME.password)
    await call('/me/nutrition-targets', {
      method: 'PUT',
      cookie,
      body: { kcal: 2000, proteinG: 140 },
    })
    const wrong = await call('/me/delete', {
      method: 'POST',
      cookie,
      body: { password: 'nope-nope-1' },
    })
    expect(wrong.status).toBe(400)
    const gone = await call('/me/delete', {
      method: 'POST',
      cookie,
      body: { password: ME.password },
    })
    expect(gone.status).toBe(204)
    const left = await env.DB.prepare('SELECT count(*) AS n FROM users WHERE email = ?')
      .bind(ME.email)
      .first<Json>()
    expect(left?.n).toBe(0)
    expect((await call('/me', { cookie })).status).toBe(401)

    // Staff can't delete themselves here.
    await createAdmin(COACH, 'owner', 'Cara Coaching')
    const owner = await signIn(COACH.email, COACH.password)
    const refused = await call('/me/delete', {
      method: 'POST',
      cookie: owner,
      body: { password: COACH.password },
    })
    expect(refused.status).toBe(403)
  })
})

describe('platform people view', () => {
  it('counts businesses, clients and people on their own, without their data', async () => {
    await createAdmin(COACH, 'owner', 'Cara Coaching')
    const owner = await signIn(COACH.email, COACH.password)
    await call('/admin/users', {
      method: 'POST',
      cookie: owner,
      body: { name: 'Kim', email: 'kim@example.com', password: 'client-password-1' },
    })
    await signUp(ME)
    const platform = await signInPlatform()
    const people = (await call<Json>('/platform/people', { cookie: platform, asAdminApp: true }))
      .data.people
    expect(people.totals).toMatchObject({
      businesses: 1,
      coaches: 1,
      clients: 1,
      onOwn: 1,
      unconfirmed: 1,
    })
    expect(people.weeks).toHaveLength(12)
    const thisWeek = people.weeks.at(-1)
    expect(thisWeek).toMatchObject({ businesses: 1, onOwn: 1, clients: 1 })
    expect(people.businesses).toEqual([
      expect.objectContaining({
        name: 'Cara Coaching',
        ownerEmail: COACH.email,
        coaches: 1,
        clients: 1,
      }),
    ])
    expect((await call('/platform/people', { cookie: owner })).status).toBe(404)
  })
})
