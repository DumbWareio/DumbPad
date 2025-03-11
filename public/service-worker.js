const CACHE_NAME = "PWA_CACHE_V1";
const ASSETS_TO_CACHE = [];

const preload = async () => {
  console.log("Installing web app");
  return await caches.open(CACHE_NAME)
    .then(async (cache) => {
      console.log("caching index and important routes");
      const response = await fetch("/asset-manifest.json");
      const assets = await response.json();
      ASSETS_TO_CACHE.push(...assets, "/js/marked/marked.esm.js");
      console.log("Assets Cached:", ASSETS_TO_CACHE);
      return cache.addAll(ASSETS_TO_CACHE);
  });
}

// Fetch asset manifest dynamically
globalThis.addEventListener("install", (event) => {
  event.waitUntil(preload());
});

globalThis.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

globalThis.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});