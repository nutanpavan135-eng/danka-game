const CACHE_NAME = 'danka-pwa-phase4-v1';
const APP_SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : null))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache Socket.IO/API traffic; live game state must always come from the server.
  if (url.pathname.includes('/socket.io') || url.origin.includes('onrender.com')) return;

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network-first prevents normal Chrome from staying stuck on an older Danka UI while incognito shows the new one.
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => null);
      }
      return response;
    }).catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  );
});
