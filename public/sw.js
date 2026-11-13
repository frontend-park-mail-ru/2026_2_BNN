const STATIC_CACHE = "bnn-static-v2";
const API_CACHE = "bnn-api";

const SHELL_FILES = [
  "/templates.compiled.js",
  "/vendor/handlebars.runtime.min.js",
  "/assets/icons/ui/sprite.svg",
  "/assets/icons/logo-auth.svg",
  "/assets/icons/logo-shape.svg",
  "/assets/icons/logo-shape-dark.svg",
  "/assets/images/avatar-default.svg",
  "/assets/images/avatar-default-dark.svg",
  "/assets/images/background_v1.svg",
  "/assets/images/background-dark.webp",
  "/assets/fonts/Comfortaa/static/Comfortaa-Light.woff2",
  "/assets/fonts/Comfortaa/static/Comfortaa-Regular.woff2",
  "/assets/fonts/Comfortaa/static/Comfortaa-Medium.woff2",
  "/assets/fonts/Comfortaa/static/Comfortaa-SemiBold.woff2",
  "/assets/fonts/Comfortaa/static/Comfortaa-Bold.woff2",
  "/assets/fonts/Nunito/static/Nunito-Regular.woff2",
  "/assets/fonts/Nunito/static/Nunito-SemiBold.woff2",
];
const API_PATHS = ["/api/auth/me", "/api/notes/", "/api/attachments/", "/avatars/", "/api/tags"];
const BYPASS_PATHS = ["/api/", "/swagger/"];
const NOTE_PATH = /^\/api\/notes\/[^/]+$/;

/**
 * Ответ, когда сети нет и в кэше ничего не нашлось.
 * Для API это JSON 503, для перехода — короткая HTML-страница.
 *
 * @param request Перехваченный запрос.
 * @returns Ответ со статусом 503.
 */
function offlineResponse(request) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return new Response(JSON.stringify({ message: "Нет сети" }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (request.mode === "navigate") {
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Offline</title><p>Нет сети. Откройте приложение онлайн хотя бы один раз.</p>',
      {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
  return new Response("", { status: 503, statusText: "Offline" });
}

/**
 * Добавляет путь `/assets/*.js` или `.css` в набор прекэша.
 * Скрипт ещё и ставится в очередь, чтобы вытащить из него `import`.
 *
 * @param path Путь файла из HTML или из другого скрипта.
 * @param found Уже собранные пути.
 * @param queue Скрипты, которые ещё надо прочитать.
 */
function rememberAsset(path, found, queue) {
  if (!path.startsWith("/assets/") || found.has(path) || !/\.(?:js|css)$/.test(path)) {
    return;
  }
  found.add(path);
  if (path.endsWith(".js")) {
    queue.push(path);
  }
}

/** Собирает скрипты из HTML и из их import, включая проверки современного браузера. */
async function collectAssets(html) {
  const found = new Set();
  const queue = [];
  for (const match of html.matchAll(/\/assets\/[^"'\\\s>]+\.(?:js|css)/g)) {
    rememberAsset(match[0], found, queue);
  }

  while (queue.length > 0) {
    const path = queue.shift();
    try {
      const response = await fetch(path, { cache: "reload" });
      if (!response.ok) {
        continue;
      }
      const source = await response.text();
      for (const match of source.matchAll(/\/assets\/[^"'\\\s>]+\.js/g)) {
        rememberAsset(match[0], found, queue);
      }
    } catch {
      // Нет сети на установке: файл попадёт в кэш при следующем открытии онлайн.
    }
  }

  return [...found];
}

/**
 * Кладёт файлы в кэш по одному.
 * Ошибка одного пути не отменяет установку остальных.
 *
 * @param cache Открытый статический кэш.
 * @param paths Пути оболочки и собранных ассетов.
 */
async function putPaths(cache, paths) {
  await Promise.all(
    paths.map(async (path) => {
      try {
        await cache.add(path);
      } catch {
        // Один битый файл не должен срывать установку всего кэша.
      }
    })
  );
}

/**
 * При установке worker скачивает `/`, шрифты и скрипты, на которые ссылается страница.
 */
async function precache() {
  const cache = await caches.open(STATIC_CACHE);
  const page = await fetch("/", { cache: "reload" });
  const html = await page.clone().text();
  const assets = await collectAssets(html);

  await cache.put("/", page);
  await putPaths(cache, [...SHELL_FILES, ...assets]);
}

/**
 * Удаляет кэши прошлых сборок. Текущий статический кэш и `bnn-api` оставляет.
 */
async function removeOldCaches() {
  const names = await caches.keys();
  const old = names.filter((name) => name !== STATIC_CACHE && name !== API_CACHE);
  await Promise.all(old.map((name) => caches.delete(name)));
}

/**
 * Отдаёт ответ из кэша. Если его нет, идёт в сеть и сохраняет ответ 200.
 * Для перехода без сети пробует сохранённую страницу `/`.
 *
 * @param request Исходный запрос.
 * @param cacheName Имя кэша.
 * @param cacheKey Ключ. У переходов это всегда `/`.
 * @returns Ответ из кэша, сети или заглушка 503.
 */
async function fromCache(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(cacheKey, { ignoreVary: true });
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.status === 200) {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch {
    const fresh = await cache.match(cacheKey, { ignoreVary: true });
    if (fresh) {
      return fresh;
    }
    if (request.mode === "navigate") {
      const shell = await cache.match("/", { ignoreVary: true });
      if (shell) {
        return shell;
      }
    }
    return offlineResponse(request);
  }
}

/**
 * Сначала спрашивает сеть и кэширует ответ 200. При обрыве отдаёт кэш.
 *
 * @param request Исходный запрос.
 * @param cacheName Имя кэша API.
 * @param cacheKey Ключ записи. По умолчанию сам запрос.
 * @returns Свежий ответ, кэш или JSON 503.
 */
async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.status === 200) {
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(cacheKey, { ignoreVary: true });
    if (cached) {
      return cached;
    }
    return offlineResponse(request);
  }
}

/**
 * После успешного PUT кладёт заметку в кэш API, после DELETE убирает её оттуда.
 *
 * @param request PUT или DELETE `/api/notes/:id`.
 * @returns Ответ сервера.
 */
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
  event.respondWith(fromCache(request, STATIC_CACHE, cacheKey));
});
