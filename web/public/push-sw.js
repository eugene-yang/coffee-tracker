// Web Push handler, imported into the generated service worker (vite.config.ts → workbox.importScripts).
// iOS requires every push to show a notification, so this always shows one.
self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    msg = { body: event.data ? event.data.text() : '' }
  }
  const scope = self.registration.scope // the app's base URL, ends with "/"
  const url = new URL((msg.url || '/').replace(/^\//, ''), scope).href
  event.waitUntil(
    self.registration.showNotification(msg.title || 'Coffee Tracker', {
      body: msg.body || '',
      tag: msg.tag,
      icon: scope + 'icon-192.png',
      data: { url },
    }),
  )
})

// Tapping the notification opens the app (or brings it forward) on the page it points to
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => w.url.startsWith(self.registration.scope))
      if (!open) return self.clients.openWindow(url)
      await open.focus()
      if (open.url !== url && 'navigate' in open) await open.navigate(url).catch(() => {})
    })(),
  )
})
