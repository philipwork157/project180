import { describe, expect, it } from 'vitest'
import { call, setupHousehold } from './helpers'

type Json = Record<string, any>

const recipe = (title: string, extra: Json = {}) => ({
  title,
  summary: null,
  meal: 'snack',
  category: 'meal',
  servings: 1,
  prepMinutes: 5,
  cookMinutes: 0,
  kcal: 300,
  proteinG: 20,
  carbsG: null,
  fatG: null,
  ingredients: [{ amount: 1, unit: null, name: 'egg' }],
  steps: ['Cook it.'],
  tips: null,
  sourceName: null,
  sourceUrl: null,
  ...extra,
})

async function addMany(admin: string) {
  const list = [
    recipe('Berry protein smoothie', { category: 'smoothie', meal: 'breakfast', proteinG: 35 }),
    recipe('Banana oat smoothie', { category: 'smoothie', meal: 'breakfast', proteinG: 25 }),
    recipe('Chicken rice bowl', { meal: 'lunch', proteinG: 45, kcal: 550 }),
    recipe('Protein pancakes', { category: 'baking', meal: 'breakfast', proteinG: 30 }),
    recipe('Toddler mini omelette', { category: 'toddler', meal: 'lunch', proteinG: 8 }),
    recipe('Biltong snack box', { category: 'snack', proteinG: 28, kcal: 220 }),
  ]
  for (const r of list) await call('/recipes', { method: 'POST', cookie: admin, body: r })
}

describe('recipe pages', () => {
  it('pages through recipes with counts for each chip', async () => {
    const { admin, member } = await setupHousehold()
    await addMany(admin)
    const first = await call<Json>('/recipes?adult=1&pageSize=2', { cookie: member })
    expect(first.status).toBe(200)
    expect(first.data.total).toBe(5)
    expect(first.data.recipes.map((r: Json) => r.title)).toEqual([
      'Banana oat smoothie',
      'Berry protein smoothie',
    ])
    const third = await call<Json>('/recipes?adult=1&pageSize=2&page=3', { cookie: member })
    expect(third.data.recipes.map((r: Json) => r.title)).toEqual(['Protein pancakes'])
    expect(first.data.counts).toMatchObject({
      adult: 5,
      saved: 0,
      category: { smoothie: 2, meal: 1, baking: 1, snack: 1, toddler: 1, pre_workout: 0 },
      meal: { breakfast: 3, lunch: 1, snack: 1, dinner: 0 },
    })
  })

  it('keeps toddler recipes under their own chip', async () => {
    const { admin, member } = await setupHousehold()
    await addMany(admin)
    const all = await call<Json>('/recipes?adult=1&pageSize=48', { cookie: member })
    expect(all.data.recipes.map((r: Json) => r.title)).not.toContain('Toddler mini omelette')
    const toddler = await call<Json>('/recipes?category=toddler', { cookie: member })
    expect(toddler.data.recipes.map((r: Json) => [r.title, r.category])).toEqual([
      ['Toddler mini omelette', 'toddler'],
    ])
  })

  it('filters by category, meal, search and saved, and sorts', async () => {
    const { admin, member } = await setupHousehold()
    await addMany(admin)
    const smoothies = await call<Json>('/recipes?category=smoothie&sort=protein', {
      cookie: member,
    })
    expect(smoothies.data.recipes.map((r: Json) => r.proteinG)).toEqual([35, 25])
    const breakfast = await call<Json>('/recipes?meal=breakfast&adult=1', { cookie: member })
    expect(breakfast.data.total).toBe(3)
    // Words match the name or ingredients; a plural still matches.
    const search = await call<Json>('/recipes?q=smoothies&adult=1', { cookie: member })
    expect(search.data.total).toBe(2)
    expect(search.data.counts.adult).toBe(2)
    const byIngredient = await call<Json>('/recipes?q=egg', { cookie: member })
    expect(byIngredient.data.total).toBe(6)
    // % is taken literally, not as a wildcard.
    expect((await call<Json>('/recipes?q=%25', { cookie: member })).data.total).toBe(0)

    const id = breakfast.data.recipes[0].id
    await call(`/recipes/${id}/save`, { method: 'PUT', cookie: member })
    const saved = await call<Json>('/recipes?saved=1', { cookie: member })
    expect(saved.data.recipes.map((r: Json) => r.id)).toEqual([id])
    expect(saved.data.counts.saved).toBe(1)
    // Someone else's saves never show.
    expect((await call<Json>('/recipes?saved=1', { cookie: admin })).data.total).toBe(0)
  })

  it('shows archived recipes to staff only, and refuses a bad query', async () => {
    const { admin, member } = await setupHousehold()
    await addMany(admin)
    const page = await call<Json>('/recipes?pageSize=1', { cookie: admin })
    const id = page.data.recipes[0].id
    await call(`/recipes/${id}/archive`, { method: 'POST', cookie: admin })
    expect((await call<Json>('/recipes?archived=1', { cookie: admin })).data.total).toBe(1)
    // A client asking for archived ones just gets the active list.
    const client = await call<Json>('/recipes?archived=1', { cookie: member })
    expect(client.data.recipes.map((r: Json) => r.id)).not.toContain(id)
    expect((await call('/recipes?pageSize=500', { cookie: member })).status).toBe(400)
    expect((await call('/recipes?category=pizza', { cookie: member })).status).toBe(400)
  })
})
