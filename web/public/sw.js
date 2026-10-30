// Service worker: lets phones offer "Install app", and shows order alerts for staff even when the
// site is closed (Web Push). It caches nothing: every request goes to the network as usual, so a new
// deploy shows up straight away and orders are always live.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})

// The API sends {title, body, url, tag, kind}; see api/internal/push.
self.addEventListener('push', (e) => {
  let m = {}
  try { m = e.data ? e.data.json() : {} } catch { m = { title: e.data ? e.data.text() : '' } }
  const loud = m.kind === 'new_order' || m.kind === 'cancelled'
  e.waitUntil((async () => {
    // A staff screen already open in front of Manjeet rings and speaks by itself; the
    // notification still goes up so a locked phone lights up.
    await self.registration.showNotification(m.title || 'The Urban Bites', {
      body: m.body || '',
      tag: m.tag || undefined,
      renotify: !!m.tag,
      requireInteraction: m.kind === 'new_order', // stays until tapped, like a missed call
      vibrate: m.kind === 'cancelled' ? [400, 150, 400] : loud ? [600, 200, 600, 200, 600, 200, 900] : [200],
      icon: 'brand/icon-192.png',
      badge: 'brand/favicon-64.png',
      data: { url: m.url || './?app=staff#staff' },
    })
  })())
})

// Tapping the alert opens the orders screen: focus a tab that is already open, or open one.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || './?app=staff#staff', self.registration.scope).href
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const staff = tabs.find((c) => c.url.includes('#staff')) || tabs[0]
    if (staff) {
      await staff.focus()
      if (!staff.url.includes('#staff') && 'navigate' in staff) await staff.navigate(url)
      return
    }
    await self.clients.openWindow(url)
  })())
})

// The browser rotated the subscription: hand the new one to the API so alerts keep coming.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then((tabs) => tabs.forEach((c) => c.postMessage({ type: 'ub-push-resubscribe' }))))
})
