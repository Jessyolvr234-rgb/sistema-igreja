const CACHE_NAME = "emaus-static-v3";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/apple-touch-icon.png",
  "/rede-emaus.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("emaus-static-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const offlinePage = await cache.match(OFFLINE_URL);
        if (offlinePage) return offlinePage;
        return new Response("Sem conexão com a internet.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })
    );
    return;
  }

  const isHashedNextAsset = url.pathname.startsWith("/_next/static/");
  const isPublicBrandAsset = [
    "/icon-192x192.png",
    "/icon-512x512.png",
    "/apple-touch-icon.png",
    "/rede-emaus.png",
  ].includes(url.pathname);
  if (!isHashedNextAsset && !isPublicBrandAsset) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          return caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, response.clone()))
            .then(() => response);
        }
        return response;
      });
    })
  );
});
