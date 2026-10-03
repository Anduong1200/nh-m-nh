/* Public app-shell assets only. Relationship content belongs in account-scoped IDB. */
const CACHE_PREFIX = "nha-minh-public-";
try { importScripts("/offline-build.js"); } catch { /* Dev/old installs retain the generic public fallback. */ }
const build = self.NHA_MINH_OFFLINE_BUILD;
const buildId = build && /^[A-Za-z0-9_-]{1,128}$/.test(build.id) ? build.id : "baseline";
const BUILD_ASSETS = build && Array.isArray(build.assets) && build.assets.length <= 512
  ? build.assets.filter(path => typeof path === "string" && (/^\/_next\/static\/[A-Za-z0-9_./-]+\.(js|css|woff2?|ttf)$/.test(path) || /^\/vendor\/excalidraw-0\.18\.1\/fonts\/Excalifont\/[\w.-]+\.woff2$/.test(path)) && !path.includes("..")) : [];
const SHELL_CACHE = `${CACHE_PREFIX}shell-v2-${buildId}`;
const ASSET_CACHE = `${CACHE_PREFIX}assets-v2`;
const SHELL_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];
const RECOVERY_PATH = "/offline";
const MAX_ASSETS = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(
        SHELL_ASSETS.map(
          (path) => new Request(path, { credentials: "omit", cache: "reload" }),
        ),
      ),
    ).then(async () => {
      if (buildId === "baseline") return;
      const cache = await caches.open(SHELL_CACHE);
      // The recovery document is a force-static PUBLIC page with no actor/content props.
      // Its immutable editor code is preserved separately from the bounded warm cache.
      await cache.addAll([RECOVERY_PATH, ...BUILD_ASSETS].map(path => new Request(path, { credentials: "omit", cache: "reload" })));
    }),
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
  const prepared = await (await caches.open(SHELL_CACHE)).match(request);
  if (prepared) return prepared;
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
          (url.pathname === RECOVERY_PATH ? await cache.match(RECOVERY_PATH) : undefined) ?? (await cache.match("/offline.html")) ??
          new Response("Chưa kết nối được với Nhà Mình. Bạn có thể thử lại.", {
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

// An opaque enrollment token only. Never store actor IDs, endpoints, keys or bodies here.
const PUSH_BINDING_CACHE = "nha-minh-notification-binding-v1";
const PUSH_BINDING_PATH = "/.nha-minh-notification-binding";
const pushUuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") { void self.skipWaiting(); return; }
  if (event.data?.type !== "SET_PUSH_BINDING" && event.data?.type !== "CLEAR_PUSH_BINDING") return;
  const token = event.data.type === "SET_PUSH_BINDING" ? event.data.token : null;
  if (token !== null && !pushUuid(token)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(PUSH_BINDING_CACHE);
    if (token === null) await cache.delete(PUSH_BINDING_PATH);
    else await cache.put(PUSH_BINDING_PATH, new Response(token));
    for (const notice of await self.registration.getNotifications()) notice.close();
    event.ports?.[0]?.postMessage({ type: "PUSH_BINDING_ACK", token });
  })());
});
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data;
    try { const text = event.data?.text(); if (!text || text.length > 4096) return; data = JSON.parse(text); } catch { return; }
    if (data.kind !== "nha-minh" || !pushUuid(data.deviceToken) || !pushUuid(data.eventId)) return;
    const stored = await (await caches.open(PUSH_BINDING_CACHE)).match(PUSH_BINDING_PATH);
    if (!stored || await stored.text() !== data.deviceToken) return;
    await self.registration.showNotification("Nhà Mình", { body: "Có điều mới trong Nhà.", icon: "/icons/icon-192.png", tag: data.eventId, renotify: false });
  })());
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(`${self.location.origin}/house`); await existing.focus(); }
    else await self.clients.openWindow(`${self.location.origin}/house`);
  })());
});
