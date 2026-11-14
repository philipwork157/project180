// Turning push notifications on and off for this phone.
import { ApiError, api } from '@project180/client'
import type { PushSetup } from '@project180/shared'
import { queryOptions } from '@tanstack/react-query'

/**
 * - on / off: this phone can get them, and has (or hasn't) turned them on.
 * - blocked: turned off for this app in the phone's own settings.
 * - install: an iPhone or iPad in Safari; they only work once the app is on the Home Screen.
 * - unavailable: this browser can't, or the site isn't set up to push.
 */
export type PushState = 'on' | 'off' | 'blocked' | 'install' | 'unavailable'

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const isAppleTouch = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const installed = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/** The app's service worker, or null where there is none (the dev server, private windows). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

async function readState(): Promise<{ state: PushState; setup: PushSetup | null }> {
  if (!supported()) {
    return { state: isAppleTouch() && !installed() ? 'install' : 'unavailable', setup: null }
  }
  const setup = await api<PushSetup>('/me/push')
  const reg = await registration()
  if (!setup.configured || !setup.publicKey || !reg) return { state: 'unavailable', setup }
  if (Notification.permission === 'denied') return { state: 'blocked', setup }
  const current = await reg.pushManager.getSubscription()
  return { state: current && Notification.permission === 'granted' ? 'on' : 'off', setup }
}

/** What this phone can do right now. */
export const pushStateQuery = queryOptions({
  queryKey: ['push', 'state'],
  queryFn: async () => (await readState()).state,
  staleTime: 0,
})

/** The VAPID key as bytes, the form `subscribe` wants. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const s = atob(base64url.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/**
 * Asks the phone's permission (must be called from a tap) and tells the server where to push.
 * Answers the new state.
 */
export async function turnPushOn(): Promise<PushState> {
  const { state, setup } = await readState()
  if (state !== 'off' || !setup?.publicKey) return state
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off'
  const reg = await registration()
  if (!reg) return 'unavailable'
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(setup.publicKey),
  })
  try {
    await api('/me/push', { method: 'PUT', body: subscription.toJSON() })
  } catch (err) {
    // The server doesn't know this phone: don't leave it half on.
    await subscription.unsubscribe().catch(() => undefined)
    throw err
  }
  return 'on'
}

/**
 * Right after signing in: if this phone already has notifications on (maybe from the last person
 * on it, who was signed out by the server and never got to turn them off), they now go to whoever
 * just signed in. That's also what their Profile switch shows, so it matches.
 */
export async function claimPushForMe(): Promise<void> {
  try {
    const reg = await registration()
    const subscription = await reg?.pushManager.getSubscription()
    if (!subscription) return
    await api('/me/push', { method: 'PUT', body: subscription.toJSON() }).catch(async (err) => {
      // The server refused it (not just offline): don't leave this phone getting someone
      // else's notifications.
      if (err instanceof ApiError && err.status < 500 && err.status !== 429)
        await subscription.unsubscribe()
    })
  } catch {
    // No service worker or no push here: nothing to claim.
  }
}

/**
 * Turns them off on this phone, and tells the server (while still signed in). Also called when
 * signing out, so the next person on this phone never gets the last person's notifications.
 */
export async function turnPushOff(): Promise<void> {
  try {
    const reg = await registration()
    const subscription = await reg?.pushManager.getSubscription()
    if (!subscription) return
    await api('/me/push', { method: 'DELETE', body: { endpoint: subscription.endpoint } }).catch(
      () => undefined,
    )
    await subscription.unsubscribe()
  } catch {
    // Nothing to turn off.
  }
}

/**
 * Clears the chat's notification from the phone's notification list: the message has been read
 * in the app, or it's already showing in the app's own banner.
 */
export async function closeChatNotifications(): Promise<void> {
  try {
    const reg = await registration()
    for (const n of (await reg?.getNotifications({ tag: 'chat' })) ?? []) n.close()
  } catch {
    // No service worker here: nothing to clear.
  }
}

/** The number on the app's icon (installed apps on phones that show one); 0 clears it. */
export function setIconBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.()
  void done?.catch(() => undefined)
}
