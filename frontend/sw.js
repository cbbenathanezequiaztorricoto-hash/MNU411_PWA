const CACHE_STATIC = "mnu411-static-v2";
const CACHE_CDN = "mnu411-cdn-v2";

const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/css/calculator.css",
  "/js/display_math.js",
  "/js/keypad.js",
  "/js/api_client.js",
  "/js/geogebra_native.js",
  "/js/modules_ui.js",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(async (cache) => {
      await Promise.allSettled(
        APP_SHELL.map((url) => cache.add(url).catch(() => null))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const validCaches = new Set([CACHE_STATIC, CACHE_CDN]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (!validCaches.has(key)) {
            return caches.delete(key);
          }
          return null;
        })
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Peticiones al motor matemático FastAPI (/api/*)
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(
            JSON.stringify({
              detail:
                "Sin conexión con el servidor Python. Verifica que uvicorn esté encendido."
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" }
            }
          )
      )
    );
    return;
  }

  // 2. Recursos CDN (KaTeX, MathLive, GeoGebra) -> Cache-First
  if (url.hostname.includes("jsdelivr.net") || url.hostname.includes("geogebra.org")) {
    event.respondWith(
      caches.open(CACHE_CDN).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
          return fresh;
        } catch (_) {
          return new Response("", { status: 504 });
        }
      })
    );
    return;
  }

  // 3. Archivos locales de la calculadora -> Network-First (siempre toma tus últimos cambios)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_STATIC).then(async (cache) => {
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) {
            cache.put(request, fresh.clone());
          }
          return fresh;
        } catch (_) {
          const cached = await cache.match(request);
          if (cached) return cached;
          if (request.mode === "navigate") {
            return cache.match("/index.html");
          }
          return new Response("Recurso no disponible offline", { status: 504 });
        }
      })
    );
  }
});
