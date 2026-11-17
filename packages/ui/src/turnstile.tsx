// Cloudflare Turnstile on a form: a small box that checks quietly that a person is filling it
// in (most never see a puzzle). Without a site key (local) it renders nothing and the form
// works as before. Each token works once: call reset() after the form was sent.
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<TurnstileApi> | null = null

/** Loads Cloudflare's script once per page. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile missing'))
    script.onerror = () => {
      loading = null
      reject(new Error('Couldn’t load the check'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/**
 * `widget` goes in the form; `token` is what to send with it; `ready` is true once there's a
 * token (always true without a site key).
 */
export function useTurnstile(siteKey: string | undefined): {
  widget: ReactNode
  token: string | undefined
  ready: boolean
  reset: () => void
} {
  const box = useRef<HTMLDivElement>(null)
  const id = useRef<string | null>(null)
  const [token, setToken] = useState<string>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!siteKey || !box.current) return
    let cancelled = false
    loadTurnstile().then(
      (api) => {
        if (cancelled || !box.current) return
        id.current = api.render(box.current, {
          sitekey: siteKey,
          theme: 'auto',
          size: 'flexible',
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(undefined),
          'error-callback': () => setToken(undefined),
        })
      },
      () => !cancelled && setFailed(true),
    )
    return () => {
      cancelled = true
      if (id.current) window.turnstile?.remove(id.current)
      id.current = null
    }
  }, [siteKey])

  const reset = useCallback(() => {
    setToken(undefined)
    if (id.current) window.turnstile?.reset(id.current)
  }, [])

  const widget = siteKey ? (
    <div className="flex min-h-[65px] w-full flex-col gap-1">
      <div ref={box} className="w-full" />
      {failed && (
        <p role="alert" className="font-semibold text-[13px] text-danger">
          The “are you a person” check didn’t load. Check your connection and reload the page.
        </p>
      )}
    </div>
  ) : null
  return { widget, token, ready: !siteKey || Boolean(token), reset }
}
