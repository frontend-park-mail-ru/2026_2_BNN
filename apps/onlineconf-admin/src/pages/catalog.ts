import { ApiError, getScopes, listKeys } from "../api/api";
import catalog from "../templates/catalog.hbs";
import results from "../templates/catalog-results.hbs";
import type { KeyFilters, KeyKind, KeyListItem, Scope } from "../types/onlineconf";

/** Подключает каталог и возвращает функцию очистки запросов и обработчиков. */
export function mountCatalog(
  main: HTMLElement,
  navigation: HTMLElement,
  onAccessError: (error: ApiError) => void
): () => void {
  main.innerHTML = catalog({});
  const form = main.querySelector<HTMLFormElement>("form")!;
  const query = form.elements.namedItem("query") as HTMLInputElement;
  const kind = form.elements.namedItem("kind") as HTMLSelectElement;
  const content = main.querySelector<HTMLElement>("[data-catalog-results]")!;
  const events = new AbortController();
  const filters: KeyFilters = {};
  let scopes: Scope[] | undefined;
  let request: AbortController | undefined;

  function showScopes(): void {
    navigation.replaceChildren();
    for (const scope of [undefined, ...(scopes ?? [])]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = scope ?? "Все области";
      button.dataset.scope = scope ?? "";
      button.setAttribute("aria-pressed", String(scope === filters.scope));
      navigation.append(button);
    }
  }

  /** Загружает фильтры и ключи. Ответ предыдущего запроса не меняет текущую выдачу. */
  async function load(): Promise<void> {
    request?.abort();
    const current = new AbortController();
    request = current;
    const timeout = window.setTimeout(() => current.abort(), 10_000);
    content.setAttribute("aria-busy", "true");
    content.innerHTML = results({ message: "Загружаем ключи…" });
    try {
      if (!scopes) {
        scopes = await getScopes(current.signal);
        if (request !== current || events.signal.aborted) return;
        showScopes();
      }
      const keys = await listKeys({ ...filters }, current.signal);
      if (request !== current || events.signal.aborted) return;
      const rows = keys.map((key) => {
        const date = new Date(key.updated_at);
        return {
          ...key,
          href: `/onlineconf/keys/${encodeURIComponent(key.id)}`,
          value: briefValue(key),
          updatedAt: Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ru-RU"),
          login: key.updated_by.login,
        };
      });
      content.innerHTML = results({
        rows,
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
        content.setAttribute("aria-busy", "false");
      }
    }
  }

  /** Применяет введённое имя к фильтрам каталога. */
  function search(): void {
    filters.query = query.value.trim() || undefined;
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
  kind.addEventListener(
    "change",
    () => {
      filters.kind = (kind.value || undefined) as KeyKind | undefined;
      void load();
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
  main.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("[data-catalog-retry]")) void load();
      if (event.target.closest("[data-search-clear]")) {
        query.value = "";
        search();
        query.focus();
      }
    },
    { signal: events.signal }
  );
  navigation.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>("button[data-scope]");
      if (!button || !navigation.contains(button)) return;
      filters.scope = (button.dataset.scope || undefined) as Scope | undefined;
      for (const item of navigation.querySelectorAll("button[data-scope]")) {
        item.setAttribute("aria-pressed", String(item === button));
      }
      void load();
    },
    { signal: events.signal }
  );

  void load();
  return () => {
    events.abort();
    request?.abort();
    navigation.replaceChildren();
  };
}

/** Формирует краткое значение конфига или состояние флага для таблицы. */
function briefValue(key: KeyListItem): string {
  if (key.kind === "flag") {
    return `${key.flag.enabled ? "Включён" : "Выключен"} · rollout ${key.flag.rollout_percent}%`;
  }
  const value = key.config.value;
  return typeof value === "string" ? value : JSON.stringify(value);
}
