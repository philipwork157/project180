// Two businesses side by side: owners, coaches and clients of one never see, open or change
// anything of the other: people, exercises, recipes, coaches, settings.
import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { call, createAdmin, signIn } from './helpers'

type Json = Record<string, any>

const OWNER_A = { name: 'Anna', email: 'anna@gym-a.example', password: 'owner-a-password-1' }
const OWNER_B = { name: 'Ben', email: 'ben@gym-b.example', password: 'owner-b-password-1' }
const CLIENT_A = { name: 'Ayla', email: 'ayla@example.com', password: 'client-a-password-1' }
const CLIENT_B = { name: 'Bo', email: 'bo@example.com', password: 'client-b-password-1' }

const RECIPE = {
  title: 'Chicken rice bowls',
  summary: null,
  meal: 'lunch',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 20,
  kcal: 520,
  proteinG: 48,
  carbsG: 55,
  fatG: 10,
  ingredients: [{ amount: 300, unit: 'g', name: 'chicken breast' }],
  steps: ['Cook it.'],
  tips: null,
  sourceName: null,
  sourceUrl: null,
}

/** One business, its owner signed in with one client, one exercise and one recipe of its own. */
async function business(owner: typeof OWNER_A, client: typeof CLIENT_A, name: string) {
  await createAdmin(owner, 'owner', name)
  const cookie = await signIn(owner.email, owner.password)
  const added = await call<Json>('/admin/users', { method: 'POST', cookie, body: client })
  expect(added.status).toBe(201)
  const exercise = await call<Json>('/exercises', {
    method: 'POST',
    cookie,
    body: { name: `${name} press`, muscleGroup: 'chest', equipment: 'dumbbell' },
  })
  const recipe = await call<Json>('/recipes', {
    method: 'POST',
    cookie,
    body: { ...RECIPE, title: `${name} bowl` },
  })
  const me = await call<Json>('/me', { cookie })
  return {
    cookie,
    ownerId: me.data.user.id as number,
    clientId: added.data.user.id as number,
    client: await signIn(client.email, client.password),
    exerciseId: exercise.data.exercise.id as number,
    recipeId: recipe.data.recipe.id as number,
  }
}

async function setup() {
  const a = await business(OWNER_A, CLIENT_A, 'Gym A')
  const b = await business(OWNER_B, CLIENT_B, 'Gym B')
  return { a, b }
}

describe('businesses', () => {
  it('puts everyone an owner adds into the owner’s business', async () => {
    const { a, b } = await setup()
    const row = (id: number) =>
      env.DB.prepare('SELECT business_id AS b FROM users WHERE id = ?')
        .bind(id)
        .first<{ b: number }>()
    expect((await row(a.clientId))?.b).toBe((await row(a.ownerId))?.b)
    expect((await row(b.clientId))?.b).toBe((await row(b.ownerId))?.b)
    expect((await row(a.ownerId))?.b).not.toBe((await row(b.ownerId))?.b)
  })

  it('never lists the other business’s people', async () => {
    const { a } = await setup()
    const people = await call<Json>('/admin/users', { cookie: a.cookie })
    const emails = people.data.users.map((u: Json) => u.email)
    expect(emails).toEqual(expect.arrayContaining([OWNER_A.email, CLIENT_A.email]))
    expect(emails).not.toContain(OWNER_B.email)
    expect(emails).not.toContain(CLIENT_B.email)
    for (const view of ['team', 'clients', 'mine']) {
      const page = await call<Json>(`/admin/users/directory?view=${view}`, { cookie: a.cookie })
      const seen = page.data.people.map((u: Json) => u.email)
      expect(seen, view).not.toContain(OWNER_B.email)
      expect(seen, view).not.toContain(CLIENT_B.email)
    }
    const coaches = await call<Json>('/admin/users/coaches', { cookie: a.cookie })
    expect(coaches.data.coaches.map((c: Json) => c.name)).toEqual([OWNER_A.name])
  })

  it('answers 404 for the other business’s people, whatever the owner tries', async () => {
    const { a, b } = await setup()
    const id = b.clientId
    for (const [method, path, body] of [
      ['GET', `/admin/users/${id}/activity`, undefined],
      ['GET', `/admin/users/${id}/profile`, undefined],
      ['GET', `/admin/users/${id}/food`, undefined],
      ['GET', `/admin/users/${id}/progress`, undefined],
      ['GET', `/admin/chat/${id}`, undefined],
      ['POST', `/admin/users/${id}/access`, { blocked: true }],
      ['POST', `/admin/users/${id}/password`, { password: 'new-password-123' }],
      ['DELETE', `/admin/users/${id}`, undefined],
    ] as const)
      expect(
        (await call(path, { method, cookie: a.cookie, body })).status,
        `${method} ${path}`,
      ).toBe(404)
  })

  it('never hands a client to a coach in another business', async () => {
    const { a, b } = await setup()
    const moved = await call(`/admin/users/${a.clientId}/coach`, {
      method: 'PATCH',
      cookie: a.cookie,
      body: { coachId: b.ownerId },
    })
    expect(moved.status).toBe(404)
    const added = await call('/admin/users', {
      method: 'POST',
      cookie: a.cookie,
      body: {
        name: 'Cleo',
        email: 'cleo@example.com',
        password: 'client-c-password-1',
        coachId: b.ownerId,
      },
    })
    expect(added.status).toBe(404)
  })

  it('keeps each business’s exercises to itself', async () => {
    const { a, b } = await setup()
    const list = await call<Json>('/exercises', { cookie: a.cookie })
    const ids = list.data.exercises.map((e: Json) => e.id)
    expect(ids).toContain(a.exerciseId)
    expect(ids).not.toContain(b.exerciseId)
    expect((await call(`/exercises/${b.exerciseId}`, { cookie: a.cookie })).status).toBe(404)
    const edit = await call(`/exercises/${b.exerciseId}`, {
      method: 'PATCH',
      cookie: a.cookie,
      body: { name: 'Taken over' },
    })
    expect(edit.status).toBe(404)
    // Nor can another business's exercise go into a workout.
    const workout = await call('/workouts', {
      method: 'POST',
      cookie: a.cookie,
      body: { name: 'Sneaky', exercises: [{ exerciseId: b.exerciseId, targetSets: 3 }] },
    })
    expect(workout.status).toBe(400)
    expect((workout.data as Json).error).toBe('Unknown exercise in workout')
    const quick = await call('/sessions/quick', {
      method: 'POST',
      cookie: a.cookie,
      body: {
        clientUuid: crypto.randomUUID(),
        name: 'Quick · Sneaky',
        exercises: [{ exerciseId: b.exerciseId, targetSets: 3 }],
      },
    })
    expect(quick.status).toBe(400)
    expect((quick.data as Json).error).toBe('Unknown exercise in workout')
  })

  it('keeps each business’s recipes to itself, for staff and clients', async () => {
    const { a, b } = await setup()
    for (const cookie of [a.cookie, a.client]) {
      const list = await call<Json>('/recipes', { cookie })
      const titles = list.data.recipes.map((r: Json) => r.title)
      expect(titles).toEqual(['Gym A bowl'])
      expect((await call(`/recipes/${b.recipeId}`, { cookie })).status).toBe(404)
    }
    const edit = await call(`/recipes/${b.recipeId}`, {
      method: 'PUT',
      cookie: a.cookie,
      body: { ...RECIPE, title: 'Taken over' },
    })
    expect(edit.status).toBe(404)
  })

  it('gives each business its own default photo limit', async () => {
    const { a, b } = await setup()
    const set = await call<Json>('/admin/settings/food-photos', {
      method: 'PUT',
      cookie: a.cookie,
      body: { perDay: 3 },
    })
    expect(set.data.foodPhotos.perDay).toBe(3)
    const perDay = async (cookie: string) =>
      (await call<Json>('/me/food/setup', { cookie })).data.photosPerDay
    expect(await perDay(a.client)).toBe(3)
    expect(await perDay(b.client)).toBe(10)
    const other = await call<Json>('/admin/settings/food-photos', { cookie: b.cookie })
    expect(other.data.foodPhotos.perDay).toBe(10)
  })
})
