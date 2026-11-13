import { env } from 'cloudflare:test'
import { createDb } from '@project180/db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encryptPush, fromB64url, isPushEndpoint, sendPush, vapidAuthorization } from '../src/push'
import { ADMIN, call, MEMBER, setupHousehold } from './helpers'

type Json = Record<string, any>

const utf8 = new TextEncoder()
const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  let s = ''
  for (const b of new Uint8Array(bytes as ArrayBuffer)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A pretend phone: its key pair and secret, as a browser's PushSubscription gives them. */
async function phone(name = 'phone-1') {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const publicKey = new Uint8Array(
    (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
  )
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return {
    pair,
    publicKey,
    auth,
    subscription: {
      endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
      keys: { p256dh: b64url(publicKey), auth: b64url(auth) },
    },
  }
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8),
  )
}

/** Opens a push body the way the phone's browser does (RFC 8291). */
async function decryptAsPhone(p: Awaited<ReturnType<typeof phone>>, body: Uint8Array) {
  const salt = body.slice(0, 16)
  const keyLength = body[20] ?? 0
  const sender = body.slice(21, 21 + keyLength)
  const senderKey = await crypto.subtle.importKey(
    'raw',
    sender,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  // See push.ts: the runtime reads `public`, the types say `$public`.
  const ecdh = { name: 'ECDH', public: senderKey }
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, p.pair.privateKey, 256))
  const info = new Uint8Array([...utf8.encode('WebPush: info\0'), ...p.publicKey, ...sender])
  const ikm = await hkdf(p.auth, shared, info, 32)
  const cek = await hkdf(salt, ikm, utf8.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, body.slice(21 + keyLength)),
  )
  return new TextDecoder().decode(plain.slice(0, -1))
}

/** A VAPID key pair in the form `web-push generate-vapid-keys` prints. */
async function vapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey
  return {
    pair,
    VAPID_PUBLIC_KEY: b64url((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer),
    VAPID_PRIVATE_KEY: jwk.d ?? '',
  }
}

afterEach(() => vi.restoreAllMocks())

describe('push: encryption and signing', () => {
  it('encrypts so that only that phone can read it', async () => {
    const p = await phone()
    const body = await encryptPush(p.subscription.keys, utf8.encode('{"title":"New program"}'))
    expect(await decryptAsPhone(p, body)).toBe('{"title":"New program"}')
    // Another phone can't.
    await expect(
      decryptAsPhone({ ...(await phone()), publicKey: p.publicKey }, body),
    ).rejects.toThrow()
  })

  it('signs requests with our VAPID key, for that push service only', async () => {
    const keys = await vapidKeys()
    const header = await vapidAuthorization(keys, 'https://fcm.googleapis.com/fcm/send/abc')
    const [, token = '', key] = header.match(/^vapid t=(.+), k=(.+)$/) ?? []
    expect(key).toBe(keys.VAPID_PUBLIC_KEY)
    const [head = '', claims = '', signature = ''] = token.split('.')
    expect(JSON.parse(new TextDecoder().decode(fromB64url(claims)))).toMatchObject({
      aud: 'https://fcm.googleapis.com',
      sub: expect.stringMatching(/^mailto:/),
    })
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keys.pair.publicKey,
      fromB64url(signature),
      utf8.encode(`${head}.${claims}`),
    )
    expect(valid).toBe(true)
  })

  it('only ever calls real push services', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true)
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false)
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.example/x')).toBe(false)
    expect(isPushEndpoint('https://localhost/x')).toBe(false)
  })
})

describe('push: subscriptions', () => {
  const count = async (email: string) =>
    (
      await env.DB.prepare(
        'SELECT count(*) AS n FROM push_subscriptions WHERE user_id = (SELECT id FROM users WHERE email = ?)',
      )
        .bind(email)
        .first<{ n: number }>()
    )?.n

  it('says when the site is not set up to push, and needs a sign-in', async () => {
    const { member } = await setupHousehold()
    expect((await call('/me/push')).status).toBe(401)
    const setup = await call<Json>('/me/push', { cookie: member })
    expect(setup.data).toEqual({ configured: false, publicKey: null })
  })

  it('a phone belongs to whoever turned notifications on last, and only they can turn it off', async () => {
    const { admin, member } = await setupHousehold()
    const { subscription } = await phone()
    const on = await call('/me/push', { method: 'PUT', cookie: member, body: subscription })
    expect(on.status).toBe(204)
    // The same phone again doesn't make a second row.
    await call('/me/push', { method: 'PUT', cookie: member, body: subscription })
    expect(await count(MEMBER.email)).toBe(1)

    // Someone else can't remove it…
    const body = { endpoint: subscription.endpoint }
    expect((await call('/me/push', { method: 'DELETE', cookie: admin, body })).status).toBe(204)
    expect(await count(MEMBER.email)).toBe(1)
    // …but signing in on that phone and turning them on moves it to them.
    await call('/me/push', { method: 'PUT', cookie: admin, body: subscription })
    expect(await count(MEMBER.email)).toBe(0)
    expect(await count(ADMIN.email)).toBe(1)
    expect((await call('/me/push', { method: 'DELETE', cookie: admin, body })).status).toBe(204)
    expect(await count(ADMIN.email)).toBe(0)
  })

  it('refuses an address that is not a push service', async () => {
    const { member } = await setupHousehold()
    const { subscription } = await phone()
    const res = await call('/me/push', {
      method: 'PUT',
      cookie: member,
      body: { ...subscription, endpoint: 'https://evil.example/collect' },
    })
    expect(res.status).toBe(400)
    expect(await count(MEMBER.email)).toBe(0)
  })

  it('deleting a person removes their phones', async () => {
    const { admin, member } = await setupHousehold()
    const { subscription } = await phone()
    await call('/me/push', { method: 'PUT', cookie: member, body: subscription })
    const me = await call<Json>('/me', { cookie: member })
    const gone = await call(`/admin/users/${me.data.user.id}`, { method: 'DELETE', cookie: admin })
    expect(gone.status).toBe(200)
    const left = await env.DB.prepare('SELECT count(*) AS n FROM push_subscriptions').first<{
      n: number
    }>()
    expect(left?.n).toBe(0)
  })
})

describe('push: sending', () => {
  it('sends an encrypted, signed message to each of their phones, and nobody else', async () => {
    const { admin, member } = await setupHousehold()
    const mine = await phone('member-phone')
    const theirs = await phone('admin-phone')
    await call('/me/push', { method: 'PUT', cookie: member, body: mine.subscription })
    await call('/me/push', { method: 'PUT', cookie: admin, body: theirs.subscription })
    const me = await call<Json>('/me', { cookie: member })

    const calls: { url: string; init: RequestInit }[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(null, { status: 201 })
    })
    const keys = await vapidKeys()
    const message = {
      title: 'New program: Base',
      body: 'Pieter set it up for you.',
      url: '/calendar',
    }
    const result = await sendPush({ ...env, ...keys }, createDb(env.DB), [me.data.user.id], message)

    expect(result).toEqual({ sent: 1 })
    expect(calls.map((c) => c.url)).toEqual([mine.subscription.endpoint])
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('content-encoding')).toBe('aes128gcm')
    expect(headers.get('authorization')).toMatch(/^vapid t=.+, k=.+$/)
    const sent = await decryptAsPhone(mine, calls[0]?.init.body as Uint8Array)
    expect(JSON.parse(sent)).toEqual(message)
  })

  it('forgets a phone that has turned notifications off (410), and never throws', async () => {
    const { member } = await setupHousehold()
    const { subscription } = await phone()
    await call('/me/push', { method: 'PUT', cookie: member, body: subscription })
    const me = await call<Json>('/me', { cookie: member })
    const keys = await vapidKeys()
    const db = createDb(env.DB)
    const message = { title: 'Hi', body: 'There' }

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('offline'))
    expect(await sendPush({ ...env, ...keys }, db, [me.data.user.id], message)).toEqual({ sent: 0 })
    const kept = await env.DB.prepare('SELECT count(*) AS n FROM push_subscriptions').first<Json>()
    expect(kept?.n).toBe(1)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 410 }))
    expect(await sendPush({ ...env, ...keys }, db, [me.data.user.id], message)).toEqual({ sent: 0 })
    const left = await env.DB.prepare('SELECT count(*) AS n FROM push_subscriptions').first<Json>()
    expect(left?.n).toBe(0)
  })

  it('without VAPID keys nothing is sent (local dev, tests)', async () => {
    const { member } = await setupHousehold()
    const { subscription } = await phone()
    await call('/me/push', { method: 'PUT', cookie: member, body: subscription })
    const me = await call<Json>('/me', { cookie: member })
    const spy = vi.spyOn(globalThis, 'fetch')
    expect(
      await sendPush(env, createDb(env.DB), [me.data.user.id], { title: 'a', body: 'b' }),
    ).toEqual({
      sent: 0,
    })
    expect(spy).not.toHaveBeenCalled()
  })
})
