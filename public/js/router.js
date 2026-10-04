import { NotesPage, resetNotesStore } from "./pages/notes.js";
import { LoginPage } from "./pages/login.js";
import { SignupPage } from "./pages/signup.js";
import { NotFoundPage } from "./pages/notfound.js";
import { api } from "./api.js";
import { getState, setState } from "./store/app-store.js";

/**
 * @typedef {Object} RouteRecord
 * @property {string} path Маска URL.
 * @property {{ render: Function, mount?: Function, destroy?: Function }} page Объект страницы.
 * @property {boolean} [auth] Требуется авторизация.
 * @property {boolean} [guest] Доступно только гостям.
 */

/** @type {RouteRecord[]} */
const routes = [
  { path: "/", page: NotesPage, auth: true },
  { path: "/notes", page: NotesPage, auth: true },
  { path: "/notes/favourites", page: NotesPage, auth: true },
  { path: "/notes/trash", page: NotesPage, auth: true },
  { path: "/notes/mail", page: NotesPage, auth: true },
  { path: "/notes/:id", page: NotesPage, auth: true },
  { path: "/login", page: LoginPage, guest: true },
  { path: "/signup", page: SignupPage, guest: true },
];

/**
 * Сопоставляет URL-путь с route-паттерном и извлекает params.
 *
 * @param {string} pattern Паттерн маршрута (например `/notes/:id`).
 * @param {string} path Текущий URL-путь.
 * @returns {Record<string, string> | null}
 */
function matchRoute(pattern, path) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params = {};

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }

  return params;
}

let currentPage = null;
let renderId = 0;

/**
 * Проверяет авторизацию пользователя:
 * использует кэш store и при необходимости делает запрос профиля.
 *
 * @returns {Promise<boolean>}
 */
async function ensureAuth() {
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
 * Главный роутер SPA:
 * - выбирает страницу по URL,
 * - проверяет доступ (auth/guest),
 * - рендерит и монтирует страницу.
 *
 * @returns {Promise<void>}
 */
export async function router() {
  const path = window.location.pathname;
  let page = NotFoundPage;
  let params = {};
  let matchedRoute = null;

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

  if (currentPage && currentPage.destroy) {
    currentPage.destroy();
  }
  currentPage = null;

  renderId++;
  const thisRender = renderId;

  const context = { path, params };
  const root = document.querySelector("#app");
  const html = await page.render(context);

  if (thisRender !== renderId) {
    return;
  }

  root.innerHTML = html;
  currentPage = page;

  if (page.mount) {
    page.mount(root, context);
  }
}

/**
 * Переходит на URL внутри SPA без перезагрузки страницы.
 *
 * @param {string} url Целевой URL.
 * @returns {Promise<void>}
 */
export async function navigate(url) {
  const currentPath = window.location.pathname + window.location.search + window.location.hash;

  if (url === currentPath) {
    return;
  }

  history.pushState(null, "", url);
  await router();
}

/**
 * Сбрасывает auth- и notes-состояние при смене пользователя/выходе.
 *
 * @returns {void}
 */
export function resetAuthState() {
  api.clearCachedProfile();
  resetNotesStore();
}

/**
 * Включает делегирование кликов по ссылкам с `data-link` для SPA-навигации.
 *
 * @returns {void}
 */
export function setupLinkHandling() {
  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-link]");

    if (!link) {
      return;
    }

    event.preventDefault();
    navigate(link.getAttribute("href"));
  });
}

/**
 * Подписывает роутер на события browser history (назад/вперёд).
 *
 * @returns {void}
 */
export function setupPopStateHandling() {
  window.addEventListener("popstate", router);
}

/**
 * Инициализирует роутинг приложения.
 *
 * @returns {Promise<void>}
 */
export async function initRouter() {
  await router();
  setupLinkHandling();
  setupPopStateHandling();
}
