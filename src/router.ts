import { NotesPage, resetNotesStore } from "./pages/notes.js";
import { LoginPage } from "./pages/login.js";
import { SignupPage } from "./pages/signup.js";
import { NotFoundPage } from "./pages/notfound.js";
import { api } from "./api.js";
import { getState, setState } from "./store/app-store.js";

interface PageContext {
  path: string;
  params: Record<string, string>;
}

interface Page {
  render(context: PageContext): Promise<string>;
  mount?(root: ParentNode, context: PageContext): void | Promise<void>;
  destroy?(): void;
}

interface RouteRecord {
  path: string;
  page: Page;
  auth?: boolean;
  guest?: boolean;
}

const routes: RouteRecord[] = [
  { path: "/", page: NotesPage, auth: true },
  { path: "/notes", page: NotesPage, auth: true },
  { path: "/notes/favourites", page: NotesPage, auth: true },
  { path: "/notes/trash", page: NotesPage, auth: true },
  { path: "/notes/notifications", page: NotesPage, auth: true },
  { path: "/notes/:id", page: NotesPage, auth: true },
  { path: "/login", page: LoginPage, guest: true },
  { path: "/signup", page: SignupPage, guest: true },
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
 * Проверяет авторизацию по кэшу store и при необходимости запрашивает профиль.
 *
 * @returns `true`, если пользователь авторизован.
 */
async function ensureAuth(): Promise<boolean> {
  const auth = getState().auth;

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
  } catch {
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
  let page: Page = NotFoundPage;
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
    currentPage.destroy();
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
