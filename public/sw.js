/**
 * DumbPad Service Worker
 * Provides offline capabilities and caching for the application
 * Created as part of PWA implementation
 */

const CACHE_NAME = 'dumbpad-cache-v1';
const API_CACHE_NAME = 'dumbpad-api-cache-v1';
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
  '/offline-sync.js',
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

// Open IndexedDB for request queue storage
function openRequestQueue() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('dumbpad-request-queue', 1);
    
    request.onerror = error => reject(error);
    request.onsuccess = event => resolve(event.target.result);
    
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('requests')) {
        const store = db.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('url', 'url', { unique: false });
      }
    };
  });
}

// Save a request to the queue for later processing
async function saveRequestToQueue(request, requestData) {
  try {
    const db = await openRequestQueue();
    const transaction = db.transaction(['requests'], 'readwrite');
    const store = transaction.objectStore('requests');
    
    const item = {
      url: request.url,
      method: request.method,
      headers: Array.from(request.headers.entries()),
      body: requestData,
      timestamp: Date.now()
    };
    
    await new Promise((resolve, reject) => {
      const req = store.add(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    
    console.log('Request saved to queue:', item);
    return true;
  } catch (error) {
    console.error('Failed to save request to queue:', error);
    return false;
  }
}

// Get all queued requests
async function getQueuedRequests() {
  try {
    const db = await openRequestQueue();
    const transaction = db.transaction(['requests'], 'readonly');
    const store = transaction.objectStore('requests');
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get queued requests:', error);
    return [];
  }
}

// Remove a request from the queue
async function removeRequestFromQueue(id) {
  try {
    const db = await openRequestQueue();
    const transaction = db.transaction(['requests'], 'readwrite');
    const store = transaction.objectStore('requests');
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to remove request from queue:', error);
    return false;
  }
}

// Replay a queued request
async function replayRequest(queuedRequest) {
  try {
    const requestInit = {
      method: queuedRequest.method,
      headers: queuedRequest.headers.reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {}),
      body: queuedRequest.body ? JSON.stringify(queuedRequest.body) : undefined
    };
    
    const response = await fetch(queuedRequest.url, requestInit);
    return response.ok;
  } catch (error) {
    console.error('Failed to replay request:', error);
    return false;
  }
}

// Process all queued requests
async function processQueue() {
  const clients = await self.clients.matchAll();
  if (clients.length === 0) return; // Only process if there's an active client
  
  const requests = await getQueuedRequests();
  console.log(`Processing ${requests.length} queued requests`);
  
  for (const request of requests) {
    const success = await replayRequest(request);
    if (success) {
      await removeRequestFromQueue(request.id);
      
      // Notify clients about successful sync
      clients.forEach(client => {
        client.postMessage({
          type: 'sync-complete',
          url: request.url,
          timestamp: request.timestamp
        });
      });
    }
  }
}

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
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
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
  const url = new URL(event.request.url);
  
  // For API requests that save notes
  if (url.pathname.startsWith('/api/notes/') && event.request.method === 'POST') {
    event.respondWith(
      fetch(event.request.clone())
        .then(response => {
          if (response.ok) {
            return response;
          }
          throw new Error('Network response was not ok');
        })
        .catch(async (err) => {
          console.log('Failed to save note, queuing for later:', err);
          
          // Clone the request before it's used
          const requestClone = event.request.clone();
          
          try {
            // Extract request body
            const requestData = await requestClone.json();
            
            // Save to IndexedDB queue
            await saveRequestToQueue(requestClone, requestData);
            
            // Return a mock successful response
            return new Response(JSON.stringify({
              success: true,
              offline: true,
              message: 'Changes saved offline and will sync when online'
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          } catch (error) {
            console.error('Error queuing request:', error);
            return new Response(JSON.stringify({
              success: false,
              error: 'Failed to save offline'
            }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        })
    );
  }
  // For API requests that load notes
  else if (url.pathname.startsWith('/api/notes/') && event.request.method === 'GET') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the successful response for offline use
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(API_CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Try to get from cache if network fails
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                return cachedResponse;
              }
              // If not in cache, return a generic response
              return new Response(JSON.stringify({
                success: false,
                offline: true,
                error: 'You are offline and this notepad is not cached'
              }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
              });
            });
        })
    );
  }
  // For static assets, use cache-first approach
  else {
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

// Listen for online status changes to process the queue
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notes') {
    event.waitUntil(processQueue());
  }
});

// Also periodically check for online status and process the queue
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_SYNC') {
    event.waitUntil(processQueue());
  }
}); 