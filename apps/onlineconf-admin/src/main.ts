import faviconUrl from "../../../public/assets/icons/logo-auth.svg";
import spriteUrl from "../../../public/assets/icons/ui/sprite.svg";
import layout from "./layout.hbs";
import page from "./page.hbs";
import { startRouter } from "./router";
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

const stopRouter = startRouter((route) => {
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
    description: route.name === "catalog" ? "Управление параметрами и флагами BNN." : "",
    id: route.name === "key" ? route.id : undefined,
    notFound: route.name === "not-found",
  });

  const catalogLink = root.querySelector<HTMLElement>("[data-catalog-link]");
  if (route.name === "not-found") catalogLink?.removeAttribute("aria-current");
  else catalogLink?.setAttribute("aria-current", "page");
  main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
});

import.meta.hot?.dispose(() => {
  events.abort();
  stopRouter();
});
