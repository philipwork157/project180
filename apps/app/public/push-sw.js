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
    self.registration.showNotification(message.title || 'Project 180', {
      body: message.body || 'Something new is waiting in the app.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // The same tag replaces the earlier notification instead of stacking up.
      tag: message.tag,
      data: { url: message.url || '/' },
    }),
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
