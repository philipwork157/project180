import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ADMIN, call, createAdmin, setupHousehold, signIn } from './helpers'

type Json = Record<string, any>

// A 1×1 PNG.
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)

function upload(id: number, cookie: string, files: Record<string, File>) {
  const form = new FormData()
  for (const [k, f] of Object.entries(files)) form.set(k, f)
  return SELF.fetch(`http://localhost/api/exercises/${id}/photos`, {
    method: 'POST',
    headers: { cookie, origin: 'http://localhost' },
    body: form,
  })
}

describe('exercise photos', () => {
  it('uploads start and finish photos, serves them, and removes them', async () => {
    await createAdmin()
    const cookie = await signIn(ADMIN.email, ADMIN.password)
    const ex = await call<Json>('/exercises', {
      method: 'POST',
      cookie,
      body: { name: 'Kegel', muscleGroup: 'pelvic_floor' },
    })
    const id = ex.data.exercise.id
    const res = await upload(id, cookie, {
      start: new File([PNG], 'start.png', { type: 'image/png' }),
      finish: new File([PNG], 'finish.png', { type: 'image/png' }),
    })
    expect(res.status).toBe(200)
    const { exercise } = (await res.json()) as Json
    expect(exercise.imageKey).toMatch(/^uploads\/exercises\/\d+\/[\w-]+:2$/)

    const [key] = exercise.imageKey.split(':')
    const photo = await SELF.fetch(`http://localhost/api/media/${key}/1`)
    expect(photo.status).toBe(200)
    expect(photo.headers.get('content-type')).toBe('image/png')
    await photo.arrayBuffer()

    const removed = await call<Json>(`/exercises/${id}/photos`, { method: 'DELETE', cookie })
    expect(removed.data.exercise.imageKey).toBe('none')
    const gone = await SELF.fetch(`http://localhost/api/media/${key}/0`)
    expect(gone.status).toBe(404)
    await gone.text()
  })

  it('refuses other file types and clients', async () => {
    const { admin, member } = await setupHousehold()
    const ex = await call<Json>('/exercises', {
      method: 'POST',
      cookie: admin,
      body: { name: 'Plank', muscleGroup: 'core' },
    })
    const bad = await upload(ex.data.exercise.id, admin, {
      start: new File(['hi'], 'a.txt', { type: 'text/plain' }),
    })
    expect(bad.status).toBe(400)
    await bad.text()
    const client = await upload(ex.data.exercise.id, member, {
      start: new File([PNG], 'a.png', { type: 'image/png' }),
    })
    expect(client.status).toBe(403)
    await client.text()
  })

  it('only serves uploads', async () => {
    const res = await SELF.fetch('http://localhost/api/media/secrets/x')
    expect(res.status).toBe(404)
    await res.text()
  })
})
