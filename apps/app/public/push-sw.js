// Push notifications, loaded into the generated service worker (workbox `importScripts` in
// vite.config.ts). The server sends { title, body, url, tag }, encrypted for this phone.

self.addEventListener('push', (event) => {
  let message = {}
  try {
    message = event.data ? event.data.json() : {}
  } catch {
    // Not ours, or unreadable: still show something (phones require a visible notification).
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(message.title || 'Project 180', {
        body: message.body || 'Something new is waiting in the app.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        // The same tag replaces the earlier notification instead of stacking up.
        tag: message.tag,
        data: { url: message.url || '/' },
      })
      // The number on the app icon, where the phone shows one (installed apps).
      if (typeof message.badge === 'number' && 'setAppBadge' in self.navigator) {
        await (message.badge > 0
          ? self.navigator.setAppBadge(message.badge)
          : self.navigator.clearAppBadge()
        ).catch(() => undefined)
      }
      // The app, if it's open, refreshes at once (and shows its own banner for chat messages).
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) w.postMessage({ type: 'push', tag: message.tag })
    })(),
  )
})

// A tap opens the app at the right screen, reusing its window when it's already open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (!open) return self.clients.openWindow(url)
      await open.focus()
      if ('navigate' in open) await open.navigate(url).catch(() => undefined)
    }),
  )
})
