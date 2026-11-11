const CACHE = 'buxcoin-v4';
const SHELL = [
  '/', '/index.html', '/css/app.css',
  '/js/api.js', '/js/charts.js', '/js/views.js', '/js/admin.js', '/js/app.js',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ error: 'Hors ligne' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetchPromise = fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => cached || caches.match('/index.html'));
      return cached ? Promise.race([fetchPromise.catch(() => cached), new Promise(r => setTimeout(() => r(cached), 1500))]) : fetchPromise;
    })
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(e.data.title, {
      body: e.data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: e.data.tag || 'buxcoin'
    });
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow('/#/dashboard');
  }));
});
