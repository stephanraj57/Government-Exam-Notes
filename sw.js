// =====================================================================
// AI Notes - Progressive Web App Service Worker (v1.0)
// High-Speed Offline Caching & Background Sync
// =====================================================================

const CACHE_NAME = "ai-notes-static-v1.0";
const API_CACHE_NAME = "ai-notes-api-v1.0";
const IMAGE_CACHE_NAME = "ai-notes-images-v1.0";

const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/about.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/assets/ailogo.png",
  "/assets/admin.jpg",
  "/favicon.png",
  "/favicon.ico"
];

// Install: Cache critical core app shell
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[ServiceWorker] Pre-cache fallback non-fatal:", err);
      });
    })
  );
});

// Activate: Clean up obsolete caches & take immediate control
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (![CACHE_NAME, API_CACHE_NAME, IMAGE_CACHE_NAME].includes(key)) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Strategy dispatcher based on request type
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-GET requests (mutations, telemetry, logins)
  if (request.method !== "GET") {
    return;
  }

  // 1. Navigation requests (HTML pages) -> Network-First with Offline Cache Fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            if (url.pathname.includes("about")) {
              return caches.match("/about.html");
            }
            return caches.match("/index.html");
          });
        })
    );
    return;
  }

  // 2. Notes API (/api/notes) -> Network-First with Offline JSON Fallback
  if (url.pathname === "/api/notes") {
    event.respondWith(
      fetch(request)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(API_CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || new Response(JSON.stringify({ notes: [], offline: true }), {
              headers: { "Content-Type": "application/json" }
            });
          });
        })
    );
    return;
  }

  // 3. Cloudinary & Note Images -> Cache-First with Network Fallback
  const isImage = request.destination === "image" || 
                  url.hostname.includes("cloudinary.com") || 
                  /\.(png|jpe?g|svg|webp|ico)(\?.*)?$/i.test(url.pathname);

  if (isImage) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(IMAGE_CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkRes;
          })
          .catch(() => {
            // Return placeholder or cached logo if offline and missing
            return caches.match("/assets/ailogo.png");
          });
      })
    );
    return;
  }

  // 4. Static assets (CSS, JS, Fonts) -> Stale-While-Revalidate
  if (/\.(css|js|woff2?|ttf)(\?.*)?$/i.test(url.pathname) || url.hostname.includes("fonts.g")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkRes;
        }).catch(() => {});
        return cached || fetchPromise;
      })
    );
    return;
  }
});
