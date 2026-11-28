import type { ApiError } from "./api/api";
import faviconUrl from "../../../public/assets/icons/logo-auth.svg";
import lightLogoUrl from "../../../public/assets/icons/logo-shape.svg";
import lightAvatarUrl from "../../../public/assets/images/avatar-default.svg";
import darkAvatarUrl from "../../../public/assets/images/avatar-default-dark.svg";
import { safeResourceUrl } from "../../../src/utils/url";
import darkLogoUrl from "../../../public/assets/icons/logo-shape-dark.svg";
import { transitionTheme } from "../../../src/components/theme/transition";
import spriteUrl from "../../../public/assets/icons/ui/sprite.svg";
import layout from "./templates/layout.hbs";
import page from "./templates/page.hbs";
import { saveOnlineconfReturn } from "../../../src/utils/onlineconf-return";
import { startRouter, type Route } from "./router";
import { getAdminSession } from "./api/session";
import { mountCatalog } from "./pages/catalog";
import { mountKeyEditor } from "./pages/key-editor";
import { mountKeyHistory } from "./pages/key-history";
import { mountAdmins } from "./pages/admins";
import { mountRolloutPlans } from "./pages/rollout-plans";
import "./styles/styles.scss";

const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/svg+xml";
favicon.href = faviconUrl;
document.head.append(favicon);

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("OnlineConf root not found");

root.innerHTML = layout({ spriteUrl, logoUrl: lightLogoUrl, avatarUrl: lightAvatarUrl });
const main = root.querySelector<HTMLElement>("#onlineconf-main");
if (!main) throw new Error("OnlineConf main not found");
const adminLogin = root.querySelector<HTMLElement>("[data-admin-login]")!;
const profile = root.querySelector<HTMLDialogElement>(".onlineconf__profile")!;
const profileButton = root.querySelector<HTMLButtonElement>("[data-profile-open]")!;
const avatarImages = root.querySelectorAll<HTMLImageElement>("[data-avatar-image]");
const railNav = root.querySelector<HTMLElement>("[data-rail-nav]")!;
let avatarUrl = "";
let avatarRequest: AbortController | undefined;

const events = new AbortController();
const themeButton = root.querySelector<HTMLButtonElement>("[data-theme-toggle]")!;
const logo = root.querySelector<HTMLImageElement>("[data-brand-logo]")!;
const sidebar = root.querySelector<HTMLElement>("#onlineconf-sidebar")!;
const drawer = root.querySelector<HTMLButtonElement>("[data-sidebar-open]")!;
const backdrop = root.querySelector<HTMLElement>(".onlineconf__backdrop")!;
const create = root.querySelector<HTMLAnchorElement>("[data-create-key]")!;
const catalogView = root.querySelector<HTMLElement>("[data-catalog]")!;
const keyNav = root.querySelector<HTMLElement>("[data-keys]")!;
const keyList = root.querySelector<HTMLElement>("[data-key-list]")!;
const allScopes = root.querySelector<HTMLAnchorElement>("[data-catalog-link]")!;
const mobile = window.matchMedia("(max-width: 800px)");

function setSidebar(open: boolean): void {
  sidebar.classList.toggle("onlineconf__sidebar_open", open);
  drawer.setAttribute("aria-expanded", String(open));
  backdrop.hidden = !open;
}

function closeSidebar(): void {
  if (backdrop.hidden) return;
  setSidebar(false);
  drawer.focus();
}

drawer.addEventListener(
  "click",
  () => {
    setSidebar(true);
    sidebar.querySelector<HTMLButtonElement>("button[data-sidebar-close]")?.focus();
  },
  { signal: events.signal }
);

mobile.addEventListener("change", () => setSidebar(false), { signal: events.signal });

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape" && !event.defaultPrevented) closeSidebar();
  },
  { signal: events.signal }
);

function updateAvatar(): void {
  const dark = document.documentElement.dataset.theme === "dark";
  for (const image of avatarImages)
    image.src = avatarUrl || (dark ? darkAvatarUrl : lightAvatarUrl);
}

profileButton.addEventListener("click", () => profile.showModal(), { signal: events.signal });

for (const image of avatarImages) {
  image.addEventListener(
    "error",
    () => {
      if (!avatarUrl) return;
      avatarUrl = "";
      updateAvatar();
    },
    { signal: events.signal }
  );
}

async function loadAvatar(login: string): Promise<void> {
  const request = new AbortController();
  avatarRequest = request;
  const timeout = window.setTimeout(() => request.abort(), 10_000);
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store", signal: request.signal });
    if (!response.ok) return;
    const user = await response.json();
    if (request.signal.aborted || user?.login !== login || typeof user.avatar !== "string") return;
    const url = safeResourceUrl(user.avatar);
    if (url && new URL(url, location.origin).origin === location.origin) {
      avatarUrl = url;
      updateAvatar();
    }
  } catch {
    return;
  } finally {
    window.clearTimeout(timeout);
    if (avatarRequest === request) avatarRequest = undefined;
  }
}

/** Применяет тему к админке и обновляет кнопку переключения. */
function applyTheme(dark: boolean): void {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  logo.src = dark ? darkLogoUrl : lightLogoUrl;
  updateAvatar();
  themeButton
    .querySelector("use")
    ?.setAttribute("href", `${spriteUrl}#${dark ? "sunset" : "sunrise"}`);
  themeButton.setAttribute("aria-pressed", String(dark));
}

try {
  applyTheme(localStorage.getItem("theme") === "dark");
} catch {
  applyTheme(false);
}

themeButton.addEventListener(
  "click",
  () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    const theme = dark ? "dark" : "light";
    void transitionTheme(themeButton, theme, () => {
      applyTheme(dark);
      try {
        localStorage.setItem("theme", theme);
      } catch {
        return;
      }
    });
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
let catalog: ReturnType<typeof mountCatalog> | undefined;
let stopDetailPage: (() => void) | undefined;
let editor: ReturnType<typeof mountKeyEditor> | undefined;

/** Освобождает предыдущий экран и отображает маршрут с учётом состояния доступа. */
const render = (route: Route): void => {
  editor?.destroy();
  editor = undefined;
  stopDetailPage?.();
  stopDetailPage = undefined;

  setSidebar(false);
  const canManage = access === "ready";
  const search = canManage && route.name === "catalog";
  catalogView.hidden = !search;
  main.hidden = search;
  create.hidden = !canManage;
  profileButton.hidden = !canManage;
  railNav.hidden = !canManage;
  keyNav.hidden = !canManage;
  const adminsLink = railNav.querySelector("[data-admins-link]");
  if (canManage && route.name === "admins") adminsLink?.setAttribute("aria-current", "page");
  else adminsLink?.removeAttribute("aria-current");
  const plansLink = railNav.querySelector("[data-rollout-plans-link]");
  if (canManage && route.name === "rollout-plans") plansLink?.setAttribute("aria-current", "page");
  else plansLink?.removeAttribute("aria-current");

  if (!canManage) {
    if (profile.open) profile.close();
    avatarRequest?.abort();
    catalog?.destroy();
    catalog = undefined;
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
      login: access === "storage-error",
    });
    return;
  }

  const titles = {
    catalog: "Конфигурации и feature flags",
    "new-key": "Создание ключа",
    key: "Карточка ключа",
    history: "История изменений",
    admins: "Администраторы",
    "rollout-plans": "Регламенты раскатки",
    "not-found": "Страница не найдена",
  };
  const title = titles[route.name];
  document.title = `${title} | OnlineConf BNN`;

  catalog ??= mountCatalog(catalogView, keyList, allScopes, handleAccessError);
  catalog.show(route);
  const scope =
    route.name === "catalog" || route.name === "new-key"
      ? new URLSearchParams(window.location.search).get("scope")?.toLowerCase()
      : catalog.selectedScope();
  create.search = scope ? new URLSearchParams({ scope }).toString() : "";

  if (search) {
    main.replaceChildren();
  } else if (route.name === "history") {
    stopDetailPage = mountKeyHistory(main, route.id, handleAccessError);
  } else if (route.name === "admins") {
    stopDetailPage = mountAdmins(main, adminLogin.textContent ?? "", handleAccessError);
  } else if (route.name === "rollout-plans") {
    stopDetailPage = mountRolloutPlans(main, handleAccessError);
  } else if (route.name === "key" || route.name === "new-key") {
    editor = mountKeyEditor(
      main,
      route.name === "key" ? route.id : undefined,
      handleAccessError,
      (path, replace) => {
        if (route.name === "new-key" && replace) catalog?.reset();
        router.navigate(path, replace);
      },
      route.name === "new-key" ? (name, scope) => catalog?.setDraft(name, scope) : undefined,
      route.name === "new-key" ? scope : undefined
    );
  } else {
    main.innerHTML = page({
      title,
      loading: false,
      notFound: route.name === "not-found",
    });
  }

  (search ? catalogView : main).querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
};

/** Обрабатывает потерю сессии и закрытый доступ одинаково для всех экранов. */
function handleAccessError(error: ApiError): void {
  if (error.status === 401) {
    redirectToLogin();
  } else {
    access = "unavailable";
    render(currentRoute);
  }
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
  avatarUrl = "";
  updateAvatar();
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
        void loadAvatar(result.user.login);
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
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-sidebar-close]")) closeSidebar();
    if (event.target.closest("[data-session-retry]")) {
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
  avatarRequest?.abort();
  catalog?.destroy();
  stopDetailPage?.();
  editor?.destroy();
  router.destroy();
});
