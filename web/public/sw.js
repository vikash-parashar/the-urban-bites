// Minimal service worker so phones offer "Install app". It caches nothing: every request goes
// to the network as usual, so a new deploy shows up straight away and orders are always live.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
