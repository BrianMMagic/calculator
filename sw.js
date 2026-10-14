// Offline cache so the calculator works in airplane mode on stage.
const CACHE = 'calc-v17';
const FILES = ['./', 'index.html', 'skin.js?v=17', 'app.js?v=17', 'ios.js?v=17', 'settings-ui.js?v=17', 'builder.js?v=17', 'skin/portrait.png', 'skin/portrait-typing.png', 'skin/landscape.png', 'skin/portrait-result.png', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES))));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))));
self.addEventListener('fetch', (e) => e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request))));
