/**
 * DumbPad Service Worker
 * Provides offline capabilities and caching for the application
 * Created as part of PWA implementation
 */

const CACHE_NAME = 'dumbpad-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/styles.css',
  '/app.js',
  '/operations.js',
  '/collaboration.js',
  '/cursor-manager.js',
  '/search.js',
  '/status.js',
  '/manifest.json',
  '/js/marked/marked.esm.js',
  '/Assets/dumbpad.svg',
  '/Assets/dumbpad.png',
  '/Assets/icons/icon-192x192.png',
  '/Assets/icons/icon-512x512.png',
  '/Assets/icons/icon-152x152.png',
  '/Assets/icons/icon-167x167.png',
  '/Assets/icons/icon-180x180.png'
];

// Install event - caching essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve cached assets when offline
self.addEventListener('fetch', (event) => {
  // For API requests (to save/load notes), use network-first approach
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  } else {
    // For static assets, use cache-first approach
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // Cache hit - return the response from the cached version
          if (response) {
            return response;
          }
          
          // Not in cache - fetch from network
          return fetch(event.request).then(
            (networkResponse) => {
              // Check if we received a valid response
              if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
              }

              // Clone the response as it's a stream that can only be consumed once
              const responseToCache = networkResponse.clone();

              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });

              return networkResponse;
            }
          ).catch(() => {
            // If both cache and network fail, serve the offline fallback page
            if (event.request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
            
            // For image requests, you might want to return a default offline image
            if (event.request.destination === 'image') {
              return caches.match('/Assets/dumbpad.svg');
            }
            
            // For other resources, just return a simple message
            return new Response('You are offline and this resource is not available in cache.');
          });
        })
    );
  }
}); 