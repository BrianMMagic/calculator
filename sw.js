// Offline cache so the calculator works in airplane mode on stage.
const CACHE = 'calc-v20';
const FILES = ['./', 'index.html', 'skin.js?v=20', 'app.js?v=20', 'ios.js?v=20', 'settings-ui.js?v=20', 'builder.js?v=20', 'skin/portrait.png', 'skin/portrait-typing.png', 'skin/landscape.png', 'skin/portrait-result.png', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); }); // "Update now" in settings
self.addEventListener('fetch', (e) => e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))));
