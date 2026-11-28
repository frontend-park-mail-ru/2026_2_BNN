import { ApiError, getScopes, listKeys } from "../api/api";
import catalog from "../templates/catalog.hbs";
import results from "../templates/catalog-results.hbs";
import sidebarKeys from "../templates/sidebar-keys.hbs";
import type { Route } from "../router";
import type { KeyFilters, KeyKind, KeyListItem, Scope } from "../types/onlineconf";

export function mountCatalog(
  panel: HTMLElement,
  list: HTMLElement,
  scopeList: HTMLElement,
  allScopes: HTMLAnchorElement,
  onAccessError: (error: ApiError) => void
) {
  panel.innerHTML = catalog({});
  const form = panel.querySelector<HTMLFormElement>("form")!;
  const query = form.elements.namedItem("query") as HTMLInputElement;
  const kind = form.elements.namedItem("kind") as HTMLSelectElement;
  const content = panel.querySelector<HTMLElement>("[data-catalog-results]")!;
  const events = new AbortController();
  let filters: KeyFilters = {};
  let scopes: Scope[] | undefined;
  let keys: KeyListItem[] = [];
  let activeId: string | undefined;
  let request: AbortController | undefined;

  function renderKeys(): void {
    list.innerHTML = sidebarKeys({
      rows: keys.map(({ id, key, scope }) => ({
        href: `/onlineconf/keys/${encodeURIComponent(id)}`,
        key,
        scope,
        active: id === activeId,
      })),
    });
  }

  function selectScope(): void {
    const scope = new URLSearchParams(location.search).get("scope");
    filters.scope = scopes?.find((item) => item === scope);
    for (const link of [allScopes, ...scopeList.querySelectorAll("a")]) {
      if ((link.dataset.scope || undefined) === filters.scope)
        link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
  }

  async function load(): Promise<void> {
    request?.abort();
    const current = new AbortController();
    request = current;
    const timeout = window.setTimeout(() => current.abort(), 10_000);
    list.setAttribute("aria-busy", "true");
    content.setAttribute("aria-busy", "true");
    content.innerHTML = results({ message: "Загружаем ключи…" });
    try {
      if (!scopes) {
        const available = await getScopes(current.signal);
        if (request !== current || events.signal.aborted) return;
        scopes = available;
        scopeList.replaceChildren(
          ...scopes.map((scope) => {
            const link = document.createElement("a");
            link.href = `/onlineconf/?scope=${encodeURIComponent(scope)}`;
            link.className = "onlineconf__key";
            link.dataset.onlineconfLink = "";
            link.dataset.scope = scope;
            link.textContent = scope;
            return link;
          })
        );
        if (activeId === undefined && location.pathname.replace(/\/$/, "") === "/onlineconf") {
          selectScope();
        }
      }
      const found = await listKeys(filters, current.signal);
      if (request !== current || events.signal.aborted) return;
      keys = found;
      renderKeys();
      content.innerHTML = results({
        rows: keys.map((key) => {
          const date = new Date(key.updated_at);
          return {
            ...key,
            href: `/onlineconf/keys/${encodeURIComponent(key.id)}`,
            value:
              key.kind === "flag"
                ? `${key.flag.enabled ? "Включён" : "Выключен"} · rollout ${key.flag.rollout_percent}%`
                : typeof key.config.value === "string"
                  ? key.config.value
                  : JSON.stringify(key.config.value),
            updatedAt: Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru-RU"),
            login: key.updated_by.login,
          };
        }),
        limited: keys.length === 200,
        message: keys.length
          ? `Получено ключей: ${keys.length}.`
          : filters.query || filters.kind
            ? "По выбранным условиям ключи не найдены."
            : filters.scope
              ? "В этой области пока нет ключей."
              : "Пока нет ключей.",
      });
    } catch (error) {
      if (request !== current || events.signal.aborted) return;
      if (error instanceof ApiError && (error.code === "NOT_FOUND" || error.status === 401)) {
        onAccessError(error);
        return;
      }
      content.innerHTML = results({
        message: current.signal.aborted
          ? "Сервер не ответил вовремя. Попробуйте ещё раз."
          : "Не удалось загрузить каталог. Попробуйте ещё раз.",
        retry: true,
      });
    } finally {
      window.clearTimeout(timeout);
      if (request === current && !events.signal.aborted) {
        list.setAttribute("aria-busy", "false");
        content.setAttribute("aria-busy", "false");
      }
    }
  }

  function search(): void {
    filters.query = query.value.trim() || undefined;
    filters.kind = (kind.value || undefined) as KeyKind | undefined;
    keys = [];
    renderKeys();
    void load();
  }

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      search();
    },
    { signal: events.signal }
  );
  kind.addEventListener("change", search, { signal: events.signal });
  query.addEventListener(
    "input",
    () => {
      if (!query.value && filters.query) search();
    },
    { signal: events.signal }
  );
  panel.querySelector("[data-search-clear]")?.addEventListener(
    "click",
    () => {
      query.value = "";
      search();
      query.focus();
    },
    { signal: events.signal }
  );
  content.addEventListener(
    "click",
    (event) => {
      if (event.target instanceof Element && event.target.closest("[data-catalog-retry]"))
        void load();
    },
    { signal: events.signal }
  );

  return {
    show(route: Route) {
      if (route.name === "catalog") {
        const previous = filters.scope;
        selectScope();
        if (previous !== filters.scope) keys = [];
      }
      activeId = route.name === "key" || route.name === "history" ? route.id : undefined;
      renderKeys();
      void load();
    },
    reset() {
      form.reset();
      filters = {};
      for (const link of scopeList.querySelectorAll("a")) link.removeAttribute("aria-current");
      allScopes.setAttribute("aria-current", "true");
      keys = [];
    },
    destroy() {
      events.abort();
      request?.abort();
      list.replaceChildren();
      scopeList.replaceChildren();
    },
  };
}
