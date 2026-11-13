// Workers rate limiting (wrangler.jsonc "ratelimits"). Counts are approximate and kept per
// Cloudflare location; they stop floods, not the odd extra request. Without the binding
// (local dev, tests) everything is allowed.
import { HTTPException } from 'hono/http-exception'

/** True while `key` is under the limit. A limiter that fails never blocks anyone. */
export async function withinLimit(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  if (!limiter) return true
  try {
    return (await limiter.limit({ key })).success
  } catch (err) {
    console.error('[rate-limit]', err)
    return true
  }
}

/** 429 when this person is sending too fast (chat messages, coach feedback). */
export async function assertCanSend(limiter: RateLimit | undefined, userId: number) {
  if (!(await withinLimit(limiter, `send:${userId}`)))
    throw new HTTPException(429, { message: 'You’re sending a lot. Please wait a minute.' })
}
