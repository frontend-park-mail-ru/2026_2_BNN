import { NotesPage, resetNotesStore } from "./pages/notes";
import { LoginPage } from "./pages/login";
import { LoginTwoFactorPage } from "./pages/login-2fa";
import { SignupPage } from "./pages/signup";
import { NotFoundPage } from "./pages/notfound";
import { api, isOfflineError } from "./api";
import { getState, setState, type User } from "./store/app-store";

/** Данные текущего маршрута, которые страница получает от роутера. */
export interface PageContext {
  /** Путь без query и hash. */
  path: string;
  /** Параметры из шаблона, например `id` в `/notes/:id`. */
  params: Partial<Record<string, string>>;
}

/** Контракт SPA-страницы: отрисовка, подключение и снятие обработчиков. */
interface Page {
  /** Возвращает HTML страницы. */
  render(context: PageContext): Promise<string>;
  /** Подключает обработчики после вставки разметки в DOM. */
  mount?(root: ParentNode, context: PageContext): void | Promise<void>;
  /** Снимает обработчики при уходе с маршрута. */
  destroy?(): void | Promise<void>;
}

/** Запись таблицы маршрутов. */
interface RouteRecord {
  /** Шаблон пути, например `/notes/:id`. */
  path: string;
  /** Страница, которую открывает этот маршрут. */
  page: Page;
  /** Маршрут доступен только авторизованному пользователю. */
  auth?: boolean;
  /** Маршрут доступен только гостю. */
  guest?: boolean;
}

const notesPage = new NotesPage();
const notFoundPage = new NotFoundPage();
const loginPage = new LoginPage();
const loginTwoFactorPage = new LoginTwoFactorPage();
const signupPage = new SignupPage();
const API_CACHE = "bnn-api";
const PROFILE_CACHE_PATH = "/api/auth/me";

const routes: RouteRecord[] = [
  { path: "/", page: notesPage, auth: true },
  { path: "/notes", page: notesPage, auth: true },
  { path: "/notes/favourites", page: notesPage, auth: true },
  { path: "/notes/trash", page: notesPage, auth: true },
  { path: "/notes/notifications", page: notesPage, auth: true },
  { path: "/notes/:id", page: notesPage, auth: true },
  { path: "/login", page: loginPage, guest: true },
  { path: "/login/2fa", page: loginTwoFactorPage, guest: true },
  { path: "/signup", page: signupPage, guest: true },
  { path: "/profile", page: notesPage, auth: true },
];

/**
 * Сопоставляет URL-путь с шаблоном маршрута и извлекает параметры.
 *
 * @param pattern Шаблон маршрута, например `/notes/:id`.
 * @param path Текущий путь без query и hash.
 * @returns Параметры маршрута или `null`, если путь не совпал.
 */
function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(":")) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

let currentPage: Page | null = null;
let renderId = 0;

/**
 * Проверяет, что JSON из кэша похож на профиль `/api/auth/me`.
 *
 * @param value Разобранное тело ответа.
 * @returns `true`, если обязательные поля профиля на месте.
 */
function isCachedUser(value: unknown): value is User {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;
  const avatarOk = typeof data.avatar === "string" || data.avatar === null;
  const providerOk = data.oauth_provider === null || data.oauth_provider === "github";

  return (
    typeof data.id === "string" &&
    typeof data.login === "string" &&
    avatarOk &&
    typeof data.created_at === "string" &&
    typeof data.updated_at === "string" &&
    typeof data.is_2fa_enabled === "boolean" &&
    providerOk
  );
}

/**
 * Достаёт профиль из кэша `bnn-api`, если его уже получали онлайн.
 *
 * @returns Профиль или `null`, если кэша нет или он битый.
 */
async function cachedProfile(): Promise<User | null> {
  if (!("caches" in window)) {
    return null;
  }

  try {
    const cache = await caches.open(API_CACHE);
    const response = await cache.match(PROFILE_CACHE_PATH, { ignoreVary: true });
    if (!response?.ok) {
      return null;
    }
    const data: unknown = await response.json();
    if (!isCachedUser(data)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Проверяет авторизацию по кэшу store и при необходимости запрашивает профиль.
 *
 * @returns `true`, если пользователь авторизован.
 */
async function ensureAuth(): Promise<boolean> {
  const auth = getState().auth;
  const knownUser = auth.user;

  if (auth.status === "authenticated" && auth.isLoggedIn) {
    return true;
  }

  if (auth.status === "unauthenticated") {
    return false;
  }

  setState({
    auth: {
      status: "loading",
      isLoggedIn: false,
      user: null,
    },
  });

  try {
    await api.getProfile();
  } catch (error) {
    if (isOfflineError(error)) {
      // Без сети сервер не может сказать «вы не вошли»: navigator.onLine
      // не видит галочку «Офлайн» у service worker, поэтому на него не опираемся.
      const profile = knownUser ?? (await cachedProfile());
      setState({
        auth: profile
          ? { status: "authenticated", isLoggedIn: true, user: profile }
          : { status: "unknown", isLoggedIn: false, user: null },
      });
      return profile !== null;
    }

    setState({
      auth: {
        status: "unauthenticated",
        isLoggedIn: false,
        user: null,
      },
    });
  }

  return getState().auth.isLoggedIn;
}

/**
 * Выбирает страницу по URL, проверяет доступ и монтирует её.
 */
export async function router(): Promise<void> {
  const path = window.location.pathname;
  let page: Page = notFoundPage;
  let params: Record<string, string> = {};
  let matchedRoute: RouteRecord | null = null;

  for (const route of routes) {
    const match = matchRoute(route.path, path);

    if (match) {
      matchedRoute = route;
      page = route.page;
      params = match;
      break;
    }
  }

  if (matchedRoute?.auth) {
    const ok = await ensureAuth();
    if (!ok) {
      await navigate("/login");
      return;
    }
  }

  if (matchedRoute?.guest) {
    const ok = await ensureAuth();
    if (ok) {
      await navigate("/notes");
      return;
    }
  }

  if (currentPage?.destroy) {
    await currentPage.destroy();
  }
  currentPage = null;

  renderId++;
  const thisRender = renderId;

  const context: PageContext = { path, params };
  const root = document.querySelector("#app");
  if (!root) {
    return;
  }

  const html = await page.render(context);

  if (thisRender !== renderId) {
    return;
  }

  root.innerHTML = html;
  currentPage = page;

  if (page.mount) {
    void page.mount(root, context);
  }
}

/**
 * Переходит на адрес внутри приложения без перезагрузки страницы.
 *
 * @param url Целевой адрес.
 */
export async function navigate(url: string): Promise<void> {
  const currentPath = window.location.pathname + window.location.search + window.location.hash;

  if (url === currentPath) {
    return;
  }

  history.pushState(null, "", url);
  await router();
}

/**
 * Сбрасывает авторизацию и заметки при смене пользователя или выходе.
 *
 * @param authStatus Статус авторизации после сброса.
 */
export function resetAuthState(authStatus: "unknown" | "unauthenticated" = "unknown"): void {
  api.clearCachedProfile(authStatus);
  window.caches?.delete(API_CACHE);
  resetNotesStore();
}

/**
 * Перехватывает клики по ссылкам с `data-link` и открывает их через роутер.
 */
export function setupLinkHandling(): void {
  document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const link = target.closest("a[data-link]");
    if (!link) {
      return;
    }

    const href = link.getAttribute("href");
    if (!href) {
      return;
    }

    event.preventDefault();
    void navigate(href);
  });
}

/**
 * Открывает предыдущую или следующую страницу из истории браузера через роутер.
 */
export function setupPopStateHandling(): void {
  window.addEventListener("popstate", () => {
    void router();
  });
}

/**
 * Запускает роутер и подключает обработчики ссылок и истории браузера.
 */
export async function initRouter(): Promise<void> {
  await router();
  setupLinkHandling();
  setupPopStateHandling();
}
