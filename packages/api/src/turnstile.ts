// Cloudflare Turnstile: checks the token the sign-up and email forms send is from a person.
// Without TURNSTILE_SECRET_KEY (local, tests) nothing is checked.
import type { Bindings } from './env'

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/** True when Turnstile isn't set up here, or Cloudflare says the token is good. */
export async function verifyTurnstile(
  env: Bindings,
  token: string | undefined,
  ip: string | undefined,
): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false
  const form = new FormData()
  form.set('secret', secret)
  form.set('response', token)
  if (ip) form.set('remoteip', ip)
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch (err) {
    // Cloudflare unreachable: refuse (a bot shouldn't get through when the check can't run).
    console.error('[turnstile] could not check', err)
    return false
  }
}
