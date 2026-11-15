// Push notifications to the phone app (Web Push), sent as plain signed fetches: the payload is
// encrypted for the phone (RFC 8291, aes128gcm) and the request signed with our VAPID key
// (RFC 8292), all with WebCrypto. No Node library: those need APIs the Workers runtime lacks.
//
// - No VAPID key pair configured (local dev, tests): nothing is sent.
// - A phone that has turned notifications off (404 / 410): its subscription is removed.
import { type Db, pushSubscriptions, sessions } from '@project180/db'
import { and, eq, getTableColumns, gt, inArray, isNull, or } from 'drizzle-orm'
import type { Context } from 'hono'
import { chunk, inChunks, runAll } from './batch'
import type { AppEnv, Bindings } from './env'

const utf8 = new TextEncoder()

/** What the phone shows. `url` is where a tap goes; the same `tag` replaces an earlier one. */
export interface PushMessage {
  title: string
  body: string
  url?: string
  tag?: string
  /** The number on the app icon (installed apps that show one); 0 clears it. */
  badge?: number
}

/** A push whose badge is worked out only when there's somewhere to send it. */
export type LaterPushMessage = Omit<PushMessage, 'badge'> & {
  badge?: number | (() => Promise<number>)
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  let s = ''
  for (const b of new Uint8Array(bytes as ArrayBuffer)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const s = atob(value.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** HKDF (SHA-256), extract then expand, for up to 32 bytes. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

/**
 * Only real push services: the address comes from the phone, and we must never be made to call
 * anything else (Chrome and Android, Safari and iOS, Firefox, Edge).
 */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return (
      url.protocol === 'https:' &&
      /^(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/.test(
        url.hostname,
      )
    )
  } catch {
    return false
  }
}

/**
 * Encrypts a message for one phone (RFC 8291). Returns the request body for its push service.
 * `sender` and `salt` are only passed by the test; normally both are made fresh for every message.
 */
export async function encryptPush(
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  plaintext: Uint8Array,
  sender?: CryptoKeyPair,
  salt: Uint8Array = crypto.getRandomValues(new Uint8Array(16)),
): Promise<Uint8Array<ArrayBuffer>> {
  const phonePublic = fromB64url(target.p256dh)
  const authSecret = fromB64url(target.auth)
  const pair =
    sender ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair)
  const ourPublic = new Uint8Array(
    (await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer,
  )
  const phoneKey = await crypto.subtle.importKey(
    'raw',
    phonePublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  // Workers' types call this key `$public`, but the runtime (like every browser) reads the
  // standard `public`. Passing a variable skips the literal check without changing behaviour.
  const ecdh = { name: 'ECDH', public: phoneKey }
  const shared = new Uint8Array(await crypto.subtle.deriveBits(ecdh, pair.privateKey, 256))
  const keyInfo = concat(utf8.encode('WebPush: info\0'), phonePublic, ourPublic)
  const ikm = await hkdf(authSecret, shared, keyInfo, 32)
  const cek = await hkdf(salt, ikm, utf8.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ])
  // One record: the message, then 0x02 marking it as the last.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      aes,
      concat(plaintext, new Uint8Array([2])) as BufferSource,
    ),
  )
  // Header: salt, record size (4096), our public key's length, our public key.
  return concat(salt, new Uint8Array([0, 0, 16, 0, ourPublic.length]), ourPublic, sealed)
}

/** The VAPID "Authorization" header: a short-lived ES256 token saying the push is from us. */
export async function vapidAuthorization(
  env: Pick<Bindings, 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'>,
  endpoint: string,
  now = Date.now(),
): Promise<string> {
  const publicKey = env.VAPID_PUBLIC_KEY ?? ''
  const point = fromB64url(publicKey)
  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: b64url(point.slice(1, 33)),
      y: b64url(point.slice(33, 65)),
      d: env.VAPID_PRIVATE_KEY ?? '',
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const part = (value: unknown) => b64url(utf8.encode(JSON.stringify(value)))
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || 'mailto:hello@project180.co.za',
  })}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    utf8.encode(unsigned),
  )
  return `vapid t=${unsigned}.${b64url(signature)}, k=${publicKey}`
}

export const pushConfigured = (env: Bindings) =>
  Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)

/** Sends to one phone. Answers 'gone' when the phone no longer wants them. */
async function sendOne(env: Bindings, target: PushTarget, message: PushMessage) {
  if (!isPushEndpoint(target.endpoint)) return 'gone' as const
  const body = await encryptPush(target, utf8.encode(JSON.stringify(message)))
  const res = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuthorization(env, target.endpoint),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      // Kept for a day if the phone is off; a newer one on the same topic replaces it.
      ttl: '86400',
      urgency: 'normal',
    },
    body,
  })
  await res.arrayBuffer().catch(() => undefined)
  if (res.status === 404 || res.status === 410) return 'gone' as const
  return res.ok ? ('sent' as const) : ('failed' as const)
}

/**
 * Sends a notification to every phone these people turned notifications on for. Never throws:
 * a push that can't be sent must not fail the action that caused it.
 */
export async function sendPush(
  env: Bindings,
  db: Db,
  userIds: number[],
  message: PushMessage,
): Promise<{ sent: number }> {
  if (!pushConfigured(env) || userIds.length === 0) return { sent: 0 }
  try {
    // Everyone, in slices (D1 allows 100 bound values per statement).
    // Only phones still signed in with the sign-in that turned them on (null: older rows).
    const now = new Date()
    const targets = await inChunks([...new Set(userIds)], (slice) =>
      db
        .select(getTableColumns(pushSubscriptions))
        .from(pushSubscriptions)
        .leftJoin(sessions, eq(sessions.id, pushSubscriptions.sessionId))
        .where(
          and(
            inArray(pushSubscriptions.userId, slice),
            or(isNull(pushSubscriptions.sessionId), gt(sessions.expiresAt, now)),
          ),
        ),
    )
    const results = await Promise.all(
      targets.map((t) =>
        sendOne(env, t, message).catch((err) => {
          console.error('[push] send failed', err)
          return 'failed' as const
        }),
      ),
    )
    const gone = targets.filter((_, i) => results[i] === 'gone').map((t) => t.id)
    await runAll(
      db,
      chunk(gone).map((ids) =>
        db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, ids)),
      ),
    )
    return { sent: results.filter((r) => r === 'sent').length }
  } catch (err) {
    console.error('[push] failed', err)
    return { sent: 0 }
  }
}

/**
 * Pushes without making the coach wait: the request answers at once and the Worker finishes
 * the sends afterwards. (Where there's nothing to keep the Worker alive, it just waits.)
 */
export async function pushLater(
  c: Context<AppEnv>,
  userIds: number[],
  message: LaterPushMessage,
): Promise<void> {
  if (!pushConfigured(c.env) || userIds.length === 0) return
  const work = (async () => {
    const { badge, ...rest } = message
    const count = typeof badge === 'function' ? await badge().catch(() => undefined) : badge
    return sendPush(
      c.env,
      c.var.db,
      userIds,
      count === undefined ? rest : { ...rest, badge: count },
    )
  })()
  try {
    c.executionCtx.waitUntil(work)
  } catch {
    await work
  }
}
