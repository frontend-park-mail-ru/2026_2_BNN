import faviconUrl from "../../../public/assets/icons/logo-auth.svg";
import spriteUrl from "../../../public/assets/icons/ui/sprite.svg";
import layout from "./layout.hbs";
import page from "./page.hbs";
import { saveOnlineconfReturn } from "../../../src/utils/onlineconf-return";
import { startRouter, type Route } from "./router";
import { getAdminSession } from "./session";
import "./styles.scss";

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

const events = new AbortController();
const themeButton = root.querySelector<HTMLButtonElement>("[data-theme-toggle]");

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

const render = (route: Route): void => {
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
    "not-found": "Страница не найдена",
  };
  const title = titles[route.name];
  document.title = `${title} | OnlineConf BNN`;
  main.innerHTML = page({
    title,
    loading: false,
    description: route.name === "catalog" ? "Управление параметрами и флагами BNN." : "",
    id: route.name === "key" ? route.id : undefined,
    notFound: route.name === "not-found",
  });

  const catalogLink = root.querySelector<HTMLElement>("[data-catalog-link]");
  if (route.name === "not-found") catalogLink?.removeAttribute("aria-current");
  else catalogLink?.setAttribute("aria-current", "page");
  main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
};

const stopRouter = startRouter((route) => {
  currentRoute = route;
  render(route);
});

async function checkSession(): Promise<void> {
  if (sessionRequest) return;
  const request = new AbortController();
  sessionRequest = request;
  const timeout = window.setTimeout(() => request.abort(), 10_000);
  access = "loading";
  render(currentRoute);
  try {
    const result = await getAdminSession(request.signal);
    if (events.signal.aborted) return;
    if (result.status === "unauthenticated") {
      if (saveOnlineconfReturn(window.location.pathname)) {
        window.location.replace("/login");
        return;
      }
      access = "storage-error";
    } else {
      access = result.status === "authenticated" ? "ready" : "unavailable";
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
  stopRouter();
});
