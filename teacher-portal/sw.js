const CACHE_NAME = 'sunnybridge-teacher-pwa-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // PWA minimal offline support
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response('You are offline', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
      });
    })
  );
});

// --- Push Notification Handlers ---
self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const title = data.title || 'SunnyBridge 通知';
      const options = {
        body: data.body || '您有一条新通知',
        icon: '/sunblogo.webp',
        data: data.url || '/'
      };
      event.waitUntil(self.registration.showNotification(title, options));
    } catch (e) {
      // Fallback if not JSON
      event.waitUntil(self.registration.showNotification('SunnyBridge 通知', { body: event.data.text() }));
    }
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const urlToOpen = event.notification.data || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        let client = windowClients[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
