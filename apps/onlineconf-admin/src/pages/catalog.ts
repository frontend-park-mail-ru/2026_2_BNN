import { ApiError, getScopes, listKeys } from "../api/api";
import catalog from "../templates/catalog.hbs";
import results from "../templates/catalog-results.hbs";
import type { Route } from "../router";
import type { KeyFilters, KeyKind, KeyListItem, Scope } from "../types/onlineconf";

export function mountCatalog(
  panel: HTMLElement,
  list: HTMLElement,
  onAccessError: (error: ApiError) => void
) {
  panel.innerHTML = catalog({});
  const form = panel.querySelector<HTMLFormElement>("form")!;
  const query = form.elements.namedItem("query") as HTMLInputElement;
  const scope = form.elements.namedItem("scope") as HTMLSelectElement;
  const kind = form.elements.namedItem("kind") as HTMLSelectElement;
  const status = panel.querySelector<HTMLElement>("[data-catalog-status]")!;
  const retry = panel.querySelector<HTMLButtonElement>("[data-catalog-retry]")!;
  const events = new AbortController();
  let filters: KeyFilters = {};
  let scopes: Scope[] | undefined;
  let keys: KeyListItem[] = [];
  let activeId: string | undefined;
  let request: AbortController | undefined;

  function renderKeys(): void {
    list.innerHTML = results({
      rows: keys.map(({ id, key, scope }) => ({
        href: `/onlineconf/keys/${encodeURIComponent(id)}`,
        key,
        scope,
        active: id === activeId,
      })),
    });
  }

  async function load(): Promise<void> {
    request?.abort();
    const current = new AbortController();
    request = current;
    const timeout = window.setTimeout(() => current.abort(), 10_000);
    list.setAttribute("aria-busy", "true");
    status.textContent = "Загружаем ключи…";
    retry.hidden = true;
    try {
      if (!scopes) {
        const available = await getScopes(current.signal);
        if (request !== current || events.signal.aborted) return;
        scopes = available;
        scope.append(...scopes.map((item) => new Option(item, item)));
      }
      const found = await listKeys(filters, current.signal);
      if (request !== current || events.signal.aborted) return;
      keys = found;
      renderKeys();
      status.textContent =
        keys.length === 200
          ? "Показано 200 ключей. Уточните поиск."
          : keys.length
            ? `Найдено ключей: ${keys.length}.`
            : filters.query || filters.scope || filters.kind
              ? "По выбранным условиям ключи не найдены."
              : "Пока нет ключей.";
    } catch (error) {
      if (request !== current || events.signal.aborted) return;
      if (error instanceof ApiError && (error.code === "NOT_FOUND" || error.status === 401)) {
        onAccessError(error);
        return;
      }
      status.textContent = current.signal.aborted
        ? "Сервер не ответил вовремя."
        : "Не удалось загрузить ключи.";
      retry.hidden = false;
    } finally {
      window.clearTimeout(timeout);
      if (request === current && !events.signal.aborted) list.setAttribute("aria-busy", "false");
    }
  }

  function search(): void {
    filters.query = query.value.trim() || undefined;
    filters.scope = (scope.value || undefined) as Scope | undefined;
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
  form.addEventListener(
    "change",
    (event) => {
      if (event.target === scope || event.target === kind) search();
    },
    { signal: events.signal }
  );
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
      form.reset();
      search();
      query.focus();
    },
    { signal: events.signal }
  );
  retry.addEventListener("click", () => void load(), { signal: events.signal });

  return {
    show(route: Route) {
      activeId = route.name === "key" ? route.id : undefined;
      renderKeys();
      void load();
    },
    reset() {
      form.reset();
      filters = {};
      keys = [];
    },
    destroy() {
      events.abort();
      request?.abort();
      list.replaceChildren();
    },
  };
}
