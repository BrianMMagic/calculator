// Offline cache so the calculator works in airplane mode on stage.
const CACHE = 'calc-v37';
const FILES = ['./', 'index.html', 'skin.js?v=37', 'app.js?v=37', 'ios.js?v=37', 'settings-ui.js?v=37', 'builder.js?v=37', 'skin/portrait.png', 'skin/portrait-typing.png', 'skin/landscape.png', 'skin/portrait-result.png', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); }); // "Update now" in settings
self.addEventListener('fetch', (e) => e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))));
// Tapping the time-match notification just brings the calculator back.
self.addEventListener('notificationclick', (e) => { e.notification.close(); e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./')))); });
