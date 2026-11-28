import { ApiError, getScopes, listKeys } from "../api/api";
import catalog from "../templates/catalog.hbs";
import results from "../templates/catalog-results.hbs";
import sidebarKeys from "../templates/sidebar-keys.hbs";
import type { Route } from "../router";
import {
  scopeLabel,
  type KeyFilters,
  type KeyKind,
  type KeyListItem,
  type Scope,
} from "../types/onlineconf";

export function mountCatalog(
  panel: HTMLElement,
  list: HTMLElement,
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
  let refreshTree = true;
  let draft: { name: string; scope: Scope } | undefined;
  const collapsed = new Set<string>();
  let activeId: string | undefined;
  let request: AbortController | undefined;

  function renderKeys(): void {
    if (filters.scope) allScopes.removeAttribute("aria-current");
    else allScopes.setAttribute("aria-current", "true");

    list.innerHTML = sidebarKeys({
      groups: (scopes ?? []).map((scope) => {
        const children = keys
          .filter((key) => key.scope === scope)
          .map(({ id, key }) => ({
            href: `/onlineconf/keys/${encodeURIComponent(id)}`,
            key,
            scope,
            active: id === activeId,
          }));
        const draftName = draft?.scope === scope ? draft.name : undefined;
        return {
          scope,
          label: scopeLabel(scope),
          href: `/onlineconf/?scope=${encodeURIComponent(scope)}`,
          keys: children,
          draft: draftName,
          active: filters.scope === scope,
          expandable: children.length > 0 || Boolean(draftName),
          open: !collapsed.has(scope),
        };
      }),
    });
  }

  function selectScope(): void {
    const scope = new URLSearchParams(location.search).get("scope")?.toLowerCase();
    filters.scope = scopes?.find((item) => item === scope);
  }

  list.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>("[data-scope-toggle]");
      const scope = button?.dataset.scopeToggle;
      if (!button || !scope) return;

      const open = collapsed.delete(scope);
      if (!open) collapsed.add(scope);
      button.setAttribute("aria-expanded", String(open));
      const children = document.getElementById(`onlineconf-scope-${scope}`);
      if (children) children.hidden = !open;
    },
    { signal: events.signal }
  );

  async function load(): Promise<void> {
    request?.abort();
    const current = new AbortController();
    request = current;
    const timeout = window.setTimeout(() => current.abort(), 10_000);
    list.setAttribute("aria-busy", "true");
    const showTable = !panel.hidden;
    content.setAttribute("aria-busy", "true");
    content.innerHTML = results({ message: "Загружаем ключи…" });
    try {
      if (!scopes) {
        const available = await getScopes(current.signal);
        if (request !== current || events.signal.aborted) return;
        scopes = available;
        if (showTable || location.pathname === "/onlineconf/keys/new") selectScope();
        renderKeys();
      }

      const filtered = Boolean(filters.scope || filters.query || filters.kind);
      const sidebar =
        refreshTree || (showTable && !filtered)
          ? listKeys({}, current.signal)
          : Promise.resolve(keys);
      const table = showTable && filtered ? listKeys(filters, current.signal) : sidebar;
      const [allKeys, found] = await Promise.all([sidebar, table]);
      if (request !== current || events.signal.aborted) return;

      keys = allKeys;
      refreshTree = false;
      const activeScope = keys.find((key) => key.id === activeId)?.scope;
      if (activeScope) collapsed.delete(activeScope);
      renderKeys();
      if (!showTable) return;
      content.innerHTML = results({
        rows: found.map((key) => {
          const date = new Date(key.updated_at);
          return {
            ...key,
            scopeLabel: scopeLabel(key.scope),
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
        limited: found.length === 200,
        message: found.length
          ? `Получено ключей: ${found.length}.`
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
      if (route.name === "catalog" || route.name === "new-key") selectScope();
      draft = undefined;
      refreshTree = true;
      activeId = route.name === "key" || route.name === "history" ? route.id : undefined;
      renderKeys();
      void load();
    },
    selectedScope() {
      return filters.scope;
    },
    setDraft(name: string, scope: Scope) {
      if (draft?.scope !== scope) collapsed.delete(scope);
      draft = { name: name.trim() || "Новый ключ", scope };
      renderKeys();
    },
    reset() {
      form.reset();
      filters = {};
    },
    destroy() {
      events.abort();
      request?.abort();
      list.replaceChildren();
    },
  };
}
