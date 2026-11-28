import faviconUrl from "../../../public/assets/icons/logo-auth.svg";
import spriteUrl from "../../../public/assets/icons/ui/sprite.svg";
import layout from "./templates/layout.hbs";
import page from "./templates/page.hbs";
import { saveOnlineconfReturn } from "../../../src/utils/onlineconf-return";
import { startRouter, type Route } from "./router";
import { getAdminSession } from "./api/session";
import { mountCatalog } from "./pages/catalog";
import { mountKeyEditor } from "./pages/key-editor";
import { mountKeyHistory } from "./pages/key-history";
import "./styles/styles.scss";

const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/svg+xml";
favicon.href = faviconUrl;
document.head.append(favicon);

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("OnlineConf root not found");

root.innerHTML = layout({});
const main = root.querySelector<HTMLElement>("#onlineconf-main");
if (!main) throw new Error("OnlineConf main not found");
const adminLogin = root.querySelector<HTMLElement>("[data-admin-login]")!;

const events = new AbortController();
const themeButton = root.querySelector<HTMLButtonElement>("[data-theme-toggle]");

/** Применяет тему к админке и обновляет кнопку переключения. */
function applyTheme(dark: boolean): void {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (themeButton) {
    themeButton
      .querySelector("use")
      ?.setAttribute("href", `${spriteUrl}#${dark ? "sunset" : "sunrise"}`);
    themeButton.setAttribute("aria-pressed", String(dark));
  }
}

try {
  applyTheme(localStorage.getItem("theme") === "dark");
} catch {
  applyTheme(false);
}

themeButton?.addEventListener(
  "click",
  () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    applyTheme(dark);
    try {
      localStorage.setItem("theme", dark ? "dark" : "light");
    } catch {
      return;
    }
  },
  { signal: events.signal }
);

window.addEventListener(
  "storage",
  (event) => {
    if (event.key === "theme") applyTheme(event.newValue === "dark");
  },
  { signal: events.signal }
);

type AccessState = "loading" | "ready" | "unavailable" | "error" | "storage-error";
let access: AccessState = "loading";
let currentRoute: Route = { name: "catalog" };
let sessionRequest: AbortController | null = null;
let stopPage: (() => void) | undefined;
let editor: ReturnType<typeof mountKeyEditor> | undefined;

/** Освобождает предыдущий экран и отображает маршрут с учётом состояния доступа. */
const render = (route: Route): void => {
  editor?.destroy();
  editor = undefined;
  stopPage?.();
  stopPage = undefined;

  if (access !== "ready") {
    const title =
      access === "loading"
        ? "Проверяем доступ"
        : access === "unavailable"
          ? "Страница не найдена или недоступна"
          : "Не удалось открыть страницу";
    const description =
      access === "loading"
        ? "Пожалуйста, подождите."
        : access === "error"
          ? "Не удалось проверить сессию. Попробуйте ещё раз."
          : access === "storage-error"
            ? "Не удалось сохранить адрес возврата. Войдите в BNN и откройте админку снова."
            : "";
    document.title = `${title} | OnlineConf BNN`;
    main.innerHTML = page({
      title,
      description,
      loading: access === "loading",
      retry: access === "error",
      bnn: access === "unavailable",
      login: access === "storage-error",
    });
    root.querySelector("[data-catalog-link]")?.removeAttribute("aria-current");
    return;
  }

  const titles = {
    catalog: "Конфигурации и feature flags",
    "new-key": "Создание ключа",
    key: "Карточка ключа",
    history: "История изменений",
    "not-found": "Страница не найдена",
  };
  const title = titles[route.name];
  document.title = `${title} | OnlineConf BNN`;

  if (route.name === "catalog") {
    stopPage = mountCatalog(main, root.querySelector<HTMLElement>("[data-scopes]")!, onAccessError);
  } else if (route.name === "history") {
    stopPage = mountKeyHistory(main, route.id, onAccessError);
  } else if (route.name === "key" || route.name === "new-key") {
    editor = mountKeyEditor(
      main,
      route.name === "key" ? route.id : undefined,
      onAccessError,
      (path, replace) => router.navigate(path, replace)
    );
  } else {
    main.innerHTML = page({
      title,
      loading: false,
      notFound: route.name === "not-found",
    });
  }

  const catalogLink = root.querySelector<HTMLElement>("[data-catalog-link]");
  if (route.name === "not-found") catalogLink?.removeAttribute("aria-current");
  else catalogLink?.setAttribute("aria-current", "page");
  main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
};

/** Обрабатывает потерю сессии и закрытый доступ одинаково для всех экранов. */
function onAccessError(error: { status: number }): void {
  if (error.status === 401) {
    redirectToLogin();
    return;
  }

  access = "unavailable";
  render(currentRoute);
}

/** Запоминает маршрут админки перед переходом к входу в BNN. */
function redirectToLogin(): void {
  const saved = saveOnlineconfReturn(window.location.pathname);
  access = saved ? "loading" : "storage-error";
  render(currentRoute);
  if (saved) window.location.replace("/login");
}

const router = startRouter(
  (route) => {
    currentRoute = route;
    render(route);
  },
  () => editor?.canLeave() ?? true
);

/** Проверяет административную сессию и выбирает состояние экрана. */
async function checkSession(): Promise<void> {
  if (sessionRequest) return;

  const request = new AbortController();
  sessionRequest = request;
  const timeout = window.setTimeout(() => request.abort(), 10_000);
  access = "loading";
  adminLogin.textContent = "";
  render(currentRoute);

  try {
    const result = await getAdminSession(request.signal);
    if (events.signal.aborted) return;
    if (result.status === "unauthenticated") {
      redirectToLogin();
      return;
    } else {
      access = result.status === "authenticated" ? "ready" : "unavailable";
      if (result.status === "authenticated") {
        adminLogin.textContent = result.user.login;
      }
    }
  } catch {
    if (events.signal.aborted) return;
    access = "error";
  } finally {
    window.clearTimeout(timeout);
    sessionRequest = null;
  }
  render(currentRoute);
}

root.addEventListener(
  "click",
  (event) => {
    if (event.target instanceof Element && event.target.closest("[data-session-retry]")) {
      void checkSession();
    }
  },
  { signal: events.signal }
);

window.addEventListener(
  "pageshow",
  (event) => {
    if (event.persisted) void checkSession();
  },
  { signal: events.signal }
);

void checkSession();

import.meta.hot?.dispose(() => {
  events.abort();
  sessionRequest?.abort();
  stopPage?.();
  editor?.destroy();
  router.destroy();
});
