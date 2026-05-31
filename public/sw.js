/* ==========================================================
   SERVICE WORKER — BUS.CLICK PWA
   Minimal service worker to enable PWA standalone mode.
   This caches the app shell for offline-first experience.
   ========================================================== */

const CACHE_NAME = 'busclick-v1';
const SHELL_ASSETS = [
    '/compra',
    '/index.css',
    '/client_app.js'
];

// Install: cache app shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(SHELL_ASSETS).catch(() => {
                // Silently fail if offline during first install
                console.log('SW: Some assets could not be cached during install.');
            });
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

// Fetch: network-first strategy (always try fresh, fallback to cache)
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and API calls
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('/api/')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache successful responses for offline fallback
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                // Offline fallback from cache
                return caches.match(event.request);
            })
    );
});
