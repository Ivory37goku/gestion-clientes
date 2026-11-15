'use strict';

const CACHE = 'gestion-clientes-v19';
const ASSETS = [
  './',
  './index.html',
  './cliente.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './supabase-config.js',
  './vendor/supabase.js',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './brand-icon.svg'
];
const ASSET_URLS = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('gestion-clientes-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const inApp = url.pathname.startsWith(new URL(self.registration.scope).pathname);
  if (!inApp && !ASSET_URLS.has(url.href)) return;

  if (request.mode === 'navigate' && inApp) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return (await cache.match(request)) || (await cache.match(new URL('./index.html', self.registration.scope).href));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
