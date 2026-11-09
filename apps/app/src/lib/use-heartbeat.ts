import { useEffect } from 'react'

/**
 * While the app is open on screen, tells the API how long it's been open, about once a minute
 * (and when it's hidden or closed). Coaches see this as "time in the app".
 */
export function useHeartbeat() {
  useEffect(() => {
    const visible = () => document.visibilityState === 'visible'
    let since: number | null = visible() ? Date.now() : null
    let pending = 0

    function flush() {
      if (since !== null) {
        pending += (Date.now() - since) / 1000
        since = visible() ? Date.now() : null
      }
      const seconds = Math.min(120, Math.round(pending))
      if (seconds < 1) return
      pending = 0
      // keepalive: still sent when the page is being hidden or closed.
      fetch('/api/me/heartbeat', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seconds }),
      }).catch(() => undefined)
    }

    function onVisibility() {
      if (visible()) since = Date.now()
      else {
        flush()
        since = null
      }
    }

    const timer = setInterval(flush, 60_000)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      flush()
    }
  }, [])
}
