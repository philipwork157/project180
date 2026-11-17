import { describe, expect, it } from 'vitest'
import { call, setupHousehold } from './helpers'

type Json = Record<string, any>

const RECIPE = {
  title: 'Chicken and jasmine rice bowl',
  summary: 'Meal-prep staple.',
  meal: 'lunch',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 20,
  kcal: 520,
  proteinG: 48,
  carbsG: 55,
  fatG: 10,
  ingredients: [
    { amount: 600, unit: 'g', name: 'chicken breast' },
    { amount: 1.5, unit: 'cup', name: 'jasmine rice' },
  ],
  steps: ['Cook the rice.', 'Grill the chicken.', 'Share between four boxes.'],
  tips: null,
  sourceName: null,
  sourceUrl: null,
}

const add = (cookie: string, body: Json = RECIPE) =>
  call<Json>('/recipes', { method: 'POST', cookie, body })

describe('recipes', () => {
  it('staff add recipes and everyone signed in can read them', async () => {
    const { admin, member } = await setupHousehold()
    const created = await add(admin)
    expect(created.status).toBe(201)
    const id = created.data.recipe.id

    const list = await call<Json>('/recipes', { cookie: member })
    expect(list.data.recipes).toHaveLength(1)
    expect(list.data.recipes[0]).toMatchObject({ title: RECIPE.title, saved: false, servings: 4 })
    const one = await call<Json>(`/recipes/${id}`, { cookie: member })
    expect(one.data.recipe.ingredients).toEqual(RECIPE.ingredients)

    expect((await call('/recipes')).status).toBe(401)
  })

  it('only staff can add, change, archive or delete', async () => {
    const { admin, member } = await setupHousehold()
    expect((await add(member)).status).toBe(403)
    const id = (await add(admin)).data.recipe.id
    const edit = { ...RECIPE, title: 'Mine now' }
    expect(
      (await call(`/recipes/${id}`, { method: 'PUT', cookie: member, body: edit })).status,
    ).toBe(403)
    expect((await call(`/recipes/${id}/archive`, { method: 'POST', cookie: member })).status).toBe(
      403,
    )
    expect((await call(`/recipes/${id}`, { method: 'DELETE', cookie: member })).status).toBe(403)

    const saved = await call<Json>(`/recipes/${id}`, { method: 'PUT', cookie: admin, body: edit })
    expect(saved.data.recipe.title).toBe('Mine now')
  })

  it('hides archived recipes from clients, and deleting removes them for good', async () => {
    const { admin, member } = await setupHousehold()
    const id = (await add(admin)).data.recipe.id
    await call(`/recipes/${id}/archive`, { method: 'POST', cookie: admin })
    expect((await call<Json>('/recipes', { cookie: member })).data.recipes).toHaveLength(0)
    expect((await call(`/recipes/${id}`, { cookie: member })).status).toBe(404)
    // A client asking for the archived list still only gets active ones.
    expect((await call<Json>('/recipes?archived=1', { cookie: member })).data.recipes).toHaveLength(
      0,
    )
    expect((await call<Json>('/recipes?archived=1', { cookie: admin })).data.recipes).toHaveLength(
      1,
    )

    await call(`/recipes/${id}/restore`, { method: 'POST', cookie: admin })
    expect((await call<Json>('/recipes', { cookie: member })).data.recipes).toHaveLength(1)
    expect((await call(`/recipes/${id}`, { method: 'DELETE', cookie: admin })).status).toBe(204)
    expect((await call(`/recipes/${id}`, { cookie: admin })).status).toBe(404)
  })

  it('keeps each person’s saved recipes to themselves', async () => {
    const { admin, member } = await setupHousehold()
    const id = (await add(admin)).data.recipe.id
    const saved = await call<Json>(`/recipes/${id}/save`, { method: 'PUT', cookie: member })
    expect(saved.data.recipe.saved).toBe(true)
    // Saving twice is fine.
    expect((await call(`/recipes/${id}/save`, { method: 'PUT', cookie: member })).status).toBe(200)

    const mine = await call<Json>('/recipes', { cookie: member })
    expect(mine.data.recipes[0].saved).toBe(true)
    const theirs = await call<Json>('/recipes', { cookie: admin })
    expect(theirs.data.recipes[0].saved).toBe(false)

    await call(`/recipes/${id}/save`, { method: 'DELETE', cookie: member })
    expect((await call<Json>(`/recipes/${id}`, { cookie: member })).data.recipe.saved).toBe(false)
  })

  it('logs a serving to the food log as a recipe', async () => {
    const { admin, member } = await setupHousehold()
    const recipe = (await add(admin)).data.recipe
    const logged = await call<Json>('/me/food', {
      method: 'POST',
      cookie: member,
      body: {
        date: '2026-11-15',
        meal: 'lunch',
        source: 'recipe',
        entries: [
          {
            clientUuid: crypto.randomUUID(),
            name: recipe.title,
            grams: null,
            kcal: recipe.kcal,
            proteinG: recipe.proteinG,
            carbsG: recipe.carbsG,
            fatG: recipe.fatG,
          },
        ],
      },
    })
    expect(logged.status).toBe(201)
    expect(logged.data.day.entries[0]).toMatchObject({ source: 'recipe', proteinG: 48 })
  })

  it('refuses a recipe with no ingredients or steps', async () => {
    const { admin } = await setupHousehold()
    expect((await add(admin, { ...RECIPE, ingredients: [] })).status).toBe(400)
    expect((await add(admin, { ...RECIPE, steps: [] })).status).toBe(400)
  })
})
