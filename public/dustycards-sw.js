const CACHE_VERSION = "3.2.23";
const STATIC_CACHE = `dustycards-static-${CACHE_VERSION}`;
const PAGE_CACHE = "dustycards-pages-v1";
const IMAGE_CACHE = "dustycards-images-v1";
const CACHE_PREFIX = "dustycards-";
const MAX_STATIC_ENTRIES = 220;
const MAX_PAGE_ENTRIES = 80;
const MAX_IMAGE_ENTRIES = 1400;

const OFFLINE_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="588" viewBox="0 0 420 588" role="img" aria-label="Image unavailable offline"><rect width="420" height="588" rx="24" fill="#101116"/><rect x="26" y="26" width="368" height="536" rx="18" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="3"/><text x="210" y="286" fill="rgba(255,255,255,0.72)" font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="26" font-weight="700" text-anchor="middle">Offline</text><text x="210" y="326" fill="rgba(255,255,255,0.46)" font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="18" font-weight="600" text-anchor="middle">Image not cached yet</text></svg>`;

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isImageRequest(request, url) {
  return (
    request.destination === "image" ||
    url.pathname === "/api/image-cache" ||
    /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(url.pathname)
  );
}

function isStaticAssetRequest(request, url) {
  return (
    isSameOrigin(url) &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/assets/") ||
      request.destination === "script" ||
      request.destination === "style" ||
      request.destination === "font" ||
      /\.(?:css|js|mjs|woff2?|ttf|otf|stl)$/i.test(url.pathname))
  );
}

function isPageRequest(request, url) {
  return (
    isSameOrigin(url) &&
    request.mode === "navigate" &&
    !url.pathname.startsWith("/api/") &&
    !url.pathname.startsWith("/_next/")
  );
}

function isBlockedRequest(url) {
  return (
    url.pathname === "/api/app-version" ||
    url.pathname.startsWith("/api/auth/") ||
    url.pathname.startsWith("/api/internal/")
  );
}

function shouldCacheResponse(response, expectedKind) {
  if (!response) return false;
  if (response.type === "opaque") return expectedKind === "image";
  if (response.status !== 200) return false;

  const contentType = response.headers.get("content-type") || "";
  if (expectedKind === "image") return contentType.startsWith("image/");
  if (expectedKind === "page") return contentType.includes("text/html");
  return true;
}

async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const overflow = keys.length - maxEntries;
    if (overflow <= 0) return;

    await Promise.all(keys.slice(0, overflow).map((key) => cache.delete(key)));
  } catch {
    // Storage may be temporarily unavailable on some mobile browsers.
  }
}

async function remember(cache, request, response, cacheName, maxEntries) {
  try {
    await cache.put(request, response.clone());
    await trimCache(cacheName, maxEntries);
  } catch {
    // Ignore cache write failures, usually quota or unsupported response details.
  }
}

async function touch(cache, request, response) {
  try {
    await cache.delete(request);
    await cache.put(request, response.clone());
  } catch {
    // Cache recency is a best-effort optimization.
  }
}

async function cacheFirst(request, cacheName, maxEntries, expectedKind) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    touch(cache, request, cached.clone());
    return cached;
  }

  try {
    const response = await fetch(request);
    if (shouldCacheResponse(response, expectedKind)) {
      await remember(cache, request, response, cacheName, maxEntries);
    }
    return response;
  } catch (error) {
    if (expectedKind === "image") {
      return new Response(OFFLINE_IMAGE_SVG, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "image/svg+xml; charset=utf-8",
        },
      });
    }
    throw error;
  }
}

async function networkFirst(request, cacheName, maxEntries, expectedKind) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (shouldCacheResponse(response, expectedKind)) {
      await remember(cache, request, response, cacheName, maxEntries);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("Offline and no cached response is available.");
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) &&
              key !== STATIC_CACHE &&
              key !== PAGE_CACHE &&
              key !== IMAGE_CACHE
          )
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (isBlockedRequest(url)) return;

  if (isImageRequest(request, url)) {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, MAX_IMAGE_ENTRIES, "image"));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, MAX_STATIC_ENTRIES, "asset"));
    return;
  }

  if (isPageRequest(request, url)) {
    event.respondWith(networkFirst(request, PAGE_CACHE, MAX_PAGE_ENTRIES, "page"));
  }
});
