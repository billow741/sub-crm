const CACHE_NAME = 'sunnybridge-pwa-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // PWA minimal offline support to pass Chrome WebAPK validation
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('目前处于离线状态 / You are offline', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
      });
    })
  );
});
