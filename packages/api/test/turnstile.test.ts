import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyTurnstile } from '../src/turnstile'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Turnstile', () => {
  it('checks nothing without a secret key (local, tests)', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(await verifyTurnstile(env, undefined, undefined)).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })

  it('with a key: refuses no token, asks Cloudflare otherwise, refuses when it can’t ask', async () => {
    const keyed = { ...env, TURNSTILE_SECRET_KEY: 'secret' }
    expect(await verifyTurnstile(keyed, undefined, undefined)).toBe(false)

    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ success: false }))
      .mockRejectedValueOnce(new Error('offline'))
    expect(await verifyTurnstile(keyed, 'good', '1.2.3.4')).toBe(true)
    expect(await verifyTurnstile(keyed, 'bad', undefined)).toBe(false)
    expect(await verifyTurnstile(keyed, 'any', undefined)).toBe(false)
    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    const form = init.body as FormData
    expect(form.get('secret')).toBe('secret')
    expect(form.get('response')).toBe('good')
    expect(form.get('remoteip')).toBe('1.2.3.4')
  })
})
