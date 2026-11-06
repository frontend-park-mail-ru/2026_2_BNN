const STATIC_CACHE = "bnn-static-v1";
const API_CACHE = "bnn-api";
const HANDLEBARS_URL =
  "https://cdn.jsdelivr.net/npm/handlebars@4.7.9/dist/handlebars.runtime.min.js";

const SHELL_FILES = [
  "/templates.compiled.js",
  "/assets/icons/ui/sprite.svg",
  "/assets/icons/logo-auth.svg",
  "/assets/icons/logo-shape.svg",
  "/assets/images/avatar-default.svg",
  "/assets/images/background_v1.svg",
  HANDLEBARS_URL,
];
const API_PATHS = ["/api/auth/me", "/api/notes/", "/api/attachments/", "/avatars/"];
const BYPASS_PATHS = ["/api/", "/swagger/"];
const NOTE_PATH = /^\/api\/notes\/[^/]+$/;

async function precache() {
  const cache = await caches.open(STATIC_CACHE);
  const page = await fetch("/", { cache: "reload" });
  const html = await page.clone().text();
  const assets = [...html.matchAll(/\/assets\/[^"']+\.(?:js|css)/g)]
    .map((match) => match[0])
    .filter((path) => !path.includes("-legacy"));

  await cache.put("/", page);
  await cache.addAll([...SHELL_FILES, ...assets]);
}

async function removeOldCaches() {
  const names = await caches.keys();
  const old = names.filter((name) => name !== STATIC_CACHE && name !== API_CACHE);
  await Promise.all(old.map((name) => caches.delete(name)));
}

async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.status === 200) {
      await cache.put(cacheKey, response.clone());
    }
    if (response.status === 401) {
      await caches.delete(API_CACHE);
    }
    return response;
  } catch (error) {
    const cached = await cache.match(cacheKey, { ignoreVary: true });
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  return cached ?? fetch(request);
}

async function syncNote(request) {
  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(API_CACHE);
    if (request.method === "PUT") {
      await cache.put(request.url, response.clone());
    } else {
      await cache.delete(request.url);
    }
  }

  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(removeOldCaches().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.href === HANDLEBARS_URL) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (NOTE_PATH.test(url.pathname) && (request.method === "PUT" || request.method === "DELETE")) {
    event.respondWith(syncNote(request));
    return;
  }

  if (request.method !== "GET") {
    return;
  }

  if (API_PATHS.some((path) => url.pathname.startsWith(path))) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (BYPASS_PATHS.some((path) => url.pathname.startsWith(path))) {
    return;
  }

  const cacheKey = request.mode === "navigate" ? "/" : request;
  event.respondWith(networkFirst(request, STATIC_CACHE, cacheKey));
});
