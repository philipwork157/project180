import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { call, setupHousehold } from './helpers'

type Json = Record<string, any>

// A 1×1 PNG.
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

const RECIPE = {
  title: 'Tuna bagel',
  summary: null,
  meal: 'lunch',
  servings: 1,
  prepMinutes: 5,
  cookMinutes: 0,
  kcal: 420,
  proteinG: 35,
  carbsG: 40,
  fatG: 9,
  ingredients: [{ amount: 1, unit: null, name: 'bagel' }],
  steps: ['Toast the bagel.', 'Add the tuna.'],
  tips: null,
  sourceName: null,
  sourceUrl: null,
}

function upload(id: number, cookie: string, file: File) {
  const form = new FormData()
  form.set('photo', file)
  return SELF.fetch(`http://localhost/api/recipes/${id}/photo`, {
    method: 'POST',
    headers: { cookie, origin: 'http://localhost' },
    body: form,
  })
}

describe('recipe photos', () => {
  it('a coach uploads a photo, everyone sees it, and removing keeps it gone', async () => {
    const { admin, member } = await setupHousehold()
    const created = await call<Json>('/recipes', { method: 'POST', cookie: admin, body: RECIPE })
    const id = created.data.recipe.id
    expect(created.data.recipe.imageKey).toBeNull()

    const res = await upload(id, admin, new File([PNG], 'bagel.png', { type: 'image/png' }))
    expect(res.status).toBe(200)
    const { recipe } = (await res.json()) as Json
    expect(recipe.imageKey).toMatch(/^uploads\/recipes\/\d+\/[\w-]+:1$/)

    // Clients read it with the recipe, and the photo itself is served.
    const seen = await call<Json>(`/recipes/${id}`, { cookie: member })
    expect(seen.data.recipe.imageKey).toBe(recipe.imageKey)
    const [key] = recipe.imageKey.split(':')
    const photo = await SELF.fetch(`http://localhost/api/media/${key}/0`)
    expect(photo.status).toBe(200)
    await photo.arrayBuffer()

    // Editing the recipe keeps its photo.
    await call(`/recipes/${id}`, {
      method: 'PUT',
      cookie: admin,
      body: { ...RECIPE, title: 'Tuna bagel melt' },
    })
    expect((await call<Json>(`/recipes/${id}`, { cookie: member })).data.recipe.imageKey).toBe(
      recipe.imageKey,
    )

    const removed = await call<Json>(`/recipes/${id}/photo`, { method: 'DELETE', cookie: admin })
    expect(removed.data.recipe.imageKey).toBe('none')
    const gone = await SELF.fetch(`http://localhost/api/media/${key}/0`)
    expect(gone.status).toBe(404)
    await gone.text()
  })

  it('refuses clients and files that aren’t photos', async () => {
    const { admin, member } = await setupHousehold()
    const created = await call<Json>('/recipes', { method: 'POST', cookie: admin, body: RECIPE })
    const id = created.data.recipe.id
    const png = new File([PNG], 'bagel.png', { type: 'image/png' })
    expect((await upload(id, member, png)).status).toBe(403)
    expect((await call(`/recipes/${id}/photo`, { method: 'DELETE', cookie: member })).status).toBe(
      403,
    )
    const text = new File(['hello'], 'notes.txt', { type: 'text/plain' })
    const refused = await upload(id, admin, text)
    expect(refused.status).toBe(400)
    await refused.text()
    expect((await upload(999_999, admin, png)).status).toBe(404)
  })
})
