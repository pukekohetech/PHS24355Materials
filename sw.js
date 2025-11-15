// sw.js – Offline-first PWA (fixed for share)
const CACHE_NAME = 'phs-materials-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './script.js',
  './questions.json',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  // CDN scripts are cached on first use – no need to pre-cache
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys =>
        Promise.all(
          keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )
      )
    ])
  );
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET' || !request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(r => {
          if (r && r.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(request, r.clone()));
          }
          return r;
        })
        .catch(() => cached || caches.match('./index.html'));

      return cached || network;
    })
  );
});
