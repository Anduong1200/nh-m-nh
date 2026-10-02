/* Public app-shell assets only. Relationship content belongs in account-scoped IDB. */
const CACHE_PREFIX = "nha-minh-public-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-v1`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-v2`;
const SHELL_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];
const MAX_ASSETS = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(
        SHELL_ASSETS.map(
          (path) => new Request(path, { credentials: "omit", cache: "reload" }),
        ),
      ),
    ),
  );
  // A new worker waits until the person explicitly accepts the update.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) =>
              name.startsWith(CACHE_PREFIX) &&
              name !== SHELL_CACHE &&
              name !== ASSET_CACHE,
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") {
    void self.skipWaiting();
  }
});

function canCacheAsset(response) {
  const policy = response.headers.get("cache-control") ?? "";
  const type = response.headers.get("content-type") ?? "";
  return (
    response.ok &&
    (response.type === "basic" || response.type === "default") &&
    /\bimmutable\b/i.test(policy) &&
    !/\b(private|no-store|no-cache)\b/i.test(policy) &&
    !response.headers.has("set-cookie") &&
    !/(text\/html|text\/x-component|application\/json)/i.test(type)
  );
}

async function loadStaticAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  // Public build files must not be fetched with session cookies.
  const response = await fetch(new Request(request, { credentials: "omit" }));
  if (canCacheAsset(response)) {
    await cache.put(request, response.clone());
    const keys = await cache.keys();
    await Promise.all(
      keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)),
    );
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (
    request.headers.has("authorization") ||
    request.cache === "no-store" ||
    request.headers.has("RSC") ||
    request.headers.has("Next-Router-Prefetch") ||
    request.headers.get("accept")?.includes("text/x-component")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (
          (await cache.match("/offline.html")) ??
          new Response("Nhà Mình đang ngoại tuyến. Thử lại khi có kết nối.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  if ((url.pathname.startsWith("/_next/static/") || /^\/vendor\/excalidraw-0\.18\.1\/fonts\/(Excalifont|Xiaolai)\/[\w.-]+\.woff2$/.test(url.pathname)) && url.search === "") {
    event.respondWith(loadStaticAsset(request));
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname) && url.search === "") {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) =>
        (await cache.match(url.pathname)) ??
        fetch(new Request(request, { credentials: "omit" })),
      ),
    );
  }
  // API, Supabase, media, authenticated HTML and all other responses are never cached.
});
