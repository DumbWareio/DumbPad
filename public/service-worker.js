let APP_VERSION = "1.0.0"; // Default version, will be updated by server

const getCacheName = (version) => `DUMBPAD_CACHE_${version}`;

const getConfig = async () => {
  try {
    const response = await fetch("/api/config");
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to fetch config:", error);
    return null; // Fallback to default version
  }
}

const getAppVersion = async () => {
  try {
    const data = await getConfig();
    if (!data || !data.version) {
      console.warn("No version found in config, using default version:", APP_VERSION);
      return APP_VERSION; // Fallback to default version
    }
    APP_VERSION = data.version; // Update global version variable
    console.log("App version fetched from config:", APP_VERSION);
    return data.version;
  } catch (error) {
    console.error("Failed to fetch app version:", error);
    return "1.0.0"; // Fallback version
  }
};

const getCurrentCacheVersion = async () => {
  const cacheNames = await caches.keys();
  const dumbpadCaches = cacheNames.filter(name => name.startsWith('DUMBPAD_CACHE_') || name.startsWith('DUMBPAD_PWA_CACHE'));
  
  if (dumbpadCaches.length === 0) {
    return null; // No cache exists
  }
  
  // Extract version from cache name (e.g., "DUMBPAD_CACHE_1.0.1" -> "1.0.1")
  const latestCache = dumbpadCaches[dumbpadCaches.length - 1];
  return latestCache.replace('DUMBPAD_CACHE_', '');
};

const installNewCache = async (version) => {
  const cacheName = getCacheName(version);
  console.log("Installing new cache:", cacheName);
  
  const cache = await caches.open(cacheName);
  
  try {
    const response = await fetch("/asset-manifest.json");
    const assets = await response.json();
    const assetsToCache = [
      ...assets,
      // Dynamically added packages
      "/js/marked/marked.esm.js",
      "/js/marked-extended-tables/index.js",
      "/js/marked-alert/index.js",
      "/js/@highlightjs/highlight.min.js",
      "/css/@highlightjs/github.min.css",
      "/css/@highlightjs/github-dark.min.css",
    ];

    // If needed, cache highlight.js languages dynamically
    // const configData = await getConfig();
    // const highlightLanguages = configData?.highlightLanguages;
    // if (highlightLanguages) {
    //   highlightLanguages.forEach(lang => {
    //     if (lang.trim()) {
    //       assetsToCache.push(`/js/@highlightjs/languages/${lang.trim()}.min.js`);
    //     }
    //   });
    // }
    
    console.log("Assets to cache:", { assetsToCache });
    await cache.addAll(assetsToCache);
    console.log("Cache installation complete for version:", version);
  } catch (error) {
    console.error("Failed to install cache:", error);
    throw error;
  }
};

const cleanupOldCaches = async (currentVersion) => {
  const currentCacheName = getCacheName(currentVersion);
  console.log("Cleaning up old caches, keeping current cache:", currentCacheName);

  const cacheNames = await caches.keys();
  const deletePromises = cacheNames
    .filter(name => (name.startsWith('DUMBPAD_CACHE_') || name.startsWith('DUMBPAD_PWA_CACHE')) && name !== currentCacheName)
    .map(name => {
      console.log("Deleting old cache:", name);
      return caches.delete(name);
    });

  return Promise.all(deletePromises);
};

const checkAndUpdateCache = async () => {
  console.log("Checking cache version...");
  
  const appVersion = await getAppVersion();
  const cacheVersion = await getCurrentCacheVersion();
  
  console.log("App version:", appVersion);
  console.log("Cache version:", cacheVersion);
  
  if (!cacheVersion) {
    // First time installation
    console.log("First time installation - installing cache");
    await installNewCache(appVersion);
    return { updated: true, firstInstall: true };
  }
  
  if (cacheVersion !== appVersion) {
    // Version mismatch - update cache
    console.log("Version mismatch - updating cache");
    await installNewCache(appVersion);
    await cleanupOldCaches(appVersion);
    return { updated: true, firstInstall: false };
  }
  
  console.log("Cache up to date");
  return { updated: false, firstInstall: false };
};

self.addEventListener("install", (event) => {
  console.log("Service worker installing...");
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service worker activating...");
  
  event.waitUntil(
    checkAndUpdateCache().then(({ updated, firstInstall }) => {
      // Take control of all clients immediately
      return self.clients.claim().then(() => {
        if (updated && !firstInstall) {
          // Cache was updated and it's not the first install - reload page
          console.log("Cache updated - notifying clients to reload");
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({ 
                type: 'CACHE_UPDATED', 
                reload: true,
                version: APP_VERSION
              });
            });
          });
        } else if (updated && firstInstall) {
          // First install - just notify, don't reload
          console.log("Cache installed for first time");
          self.clients.matchAll().then(clients => {
            clients.forEach(client => {
              client.postMessage({ 
                type: 'CACHE_INSTALLED', 
                reload: false,
                version: APP_VERSION
              });
            });
          });
        }
      });
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});

// Handle version check requests from the main thread
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === 'CHECK_VERSION') {
    checkAndUpdateCache().then(({ updated, firstInstall }) => {
      event.ports[0].postMessage({
        updated,
        firstInstall,
        version: APP_VERSION
      });
    });
  }
});