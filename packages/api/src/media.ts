import type { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv, Bindings } from './env'

/** Uploads are kept under this prefix in the MEDIA bucket. */
export const UPLOADS = 'uploads/'
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024

export function mediaBucket(env: Bindings): R2Bucket {
  if (!env.MEDIA) throw new HTTPException(503, { message: 'Photo storage isn’t set up yet.' })
  return env.MEDIA
}

/**
 * Saves 1 or 2 photos (start, finish) for an exercise and returns its new image key,
 * `uploads/exercises/<id>/<random>:<count>`. Each photo is its own object: …/0 and …/1.
 */
export async function savePhotos(
  env: Bindings,
  exerciseId: number,
  files: File[],
): Promise<string> {
  if (files.length === 0) throw new HTTPException(400, { message: 'Choose a start photo' })
  for (const f of files) {
    if (!TYPES.has(f.type))
      throw new HTTPException(400, { message: 'Photos must be JPG, PNG or WebP' })
    if (f.size > MAX_BYTES)
      throw new HTTPException(400, { message: 'Each photo must be under 5 MB' })
  }
  const bucket = mediaBucket(env)
  const prefix = `${UPLOADS}exercises/${exerciseId}/${crypto.randomUUID()}`
  for (const [i, f] of files.entries()) {
    await bucket.put(`${prefix}/${i}`, await f.arrayBuffer(), {
      httpMetadata: { contentType: f.type, cacheControl: 'public, max-age=31536000, immutable' },
    })
  }
  return `${prefix}:${files.length}`
}

/** Removes an earlier upload (bundled stock photos are left alone). */
export async function deletePhotos(env: Bindings, imageKey: string | null) {
  if (!imageKey?.startsWith(UPLOADS) || !env.MEDIA) return
  const [prefix, count] = imageKey.split(':')
  const keys = Array.from({ length: Number(count) || 1 }, (_, i) => `${prefix}/${i}`)
  await env.MEDIA.delete(keys)
}

/** GET /api/media/uploads/… : public, cached forever (every upload gets a new key). */
export function mountMedia(app: Hono<AppEnv>) {
  app.get('/media/*', async (c) => {
    const key = c.req.path.replace(/^\/api\/media\//, '')
    if (!key.startsWith(UPLOADS) || key.includes('..') || !c.env.MEDIA)
      return c.json({ error: 'Not found' }, 404)
    const obj = await c.env.MEDIA.get(key)
    if (!obj) return c.json({ error: 'Not found' }, 404)
    const headers = new Headers()
    obj.writeHttpMetadata(headers)
    headers.set('etag', obj.httpEtag)
    // Serve uploads only as the image type they were saved with, never sniffed as a page.
    headers.set('x-content-type-options', 'nosniff')
    if (!headers.has('cache-control'))
      headers.set('cache-control', 'public, max-age=31536000, immutable')
    return new Response(obj.body, { headers })
  })
}
