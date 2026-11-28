import { ApiError, getKeyHistory } from "../api/api";
import template from "../templates/key-history.hbs";
import type { JsonObject, JsonValue, KeyHistoryEntry } from "../types/onlineconf";

const ACTIONS = new Map([
  ["create", "Создание"],
  ["update", "Изменение"],
  ["delete", "Удаление"],
]);

function asObject(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

/** Сравнивает снимки по полям, сохраняя различие между отсутствующим значением и JSON null. */
function changes(entry: KeyHistoryEntry) {
  const before = entry.old_value;
  const after = entry.new_value;
  const oldFlag = asObject(before?.flag);
  const newFlag = asObject(after?.flag);
  const oldConfig = asObject(before?.config);
  const newConfig = asObject(after?.config);
  const fields = [
    ["Область", before?.scope, after?.scope],
    ["Имя ключа", before?.key, after?.key],
    ["Тип ключа", before?.kind, after?.kind],
    ["Описание", before?.description, after?.description],
    ["Публичный доступ", before?.is_public, after?.is_public],
    ["Тип значения", oldConfig?.value_type, newConfig?.value_type],
    ["Значение", oldConfig?.value, newConfig?.value],
    ["Флаг включён", oldFlag?.enabled, newFlag?.enabled],
    ["Процент раскатки", oldFlag?.rollout_percent, newFlag?.rollout_percent],
    ["Принудительно включённые пользователи", oldFlag?.include_users, newFlag?.include_users],
    ["Принудительно исключённые пользователи", oldFlag?.exclude_users, newFlag?.exclude_users],
  ] as const;

  return fields.flatMap(([label, oldValue, newValue]) => {
    const previous = JSON.stringify(oldValue, null, 2);
    const next = JSON.stringify(newValue, null, 2);
    return previous === next ? [] : [{ label, previous: previous ?? "—", next: next ?? "—" }];
  });
}

/** Показывает историю ключа и отменяет запрос при уходе с экрана. */
export function mountKeyHistory(
  main: HTMLElement,
  id: string,
  onAccessError: (error: ApiError) => void
): () => void {
  const events = new AbortController();
  const keyHref = `/onlineconf/keys/${encodeURIComponent(id)}`;
  let request: AbortController | undefined;

  /** Сохраняет фокус внутри истории при замене состояния экрана. */
  function render(context: Record<string, unknown>): void {
    const restoreFocus = main.contains(document.activeElement);
    main.innerHTML = template({ keyHref, ...context });
    if (restoreFocus) main.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }

  async function load(): Promise<void> {
    if (request) return;

    const current = new AbortController();
    request = current;
    const timeout = window.setTimeout(() => current.abort(), 10_000);
    render({ message: "Загружаем историю…", loading: true });

    try {
      const entries = await getKeyHistory(id, current.signal);
      if (events.signal.aborted) return;

      const rows = entries.map((entry) => {
        const date = new Date(entry.created_at);
        const validDate = !Number.isNaN(date.getTime());
        return {
          action: ACTIONS.get(entry.action) ?? `Неизвестное действие (${entry.action})`,
          login: entry.user.login,
          time: validDate ? date.toLocaleString("ru-RU") : "Время неизвестно",
          datetime: validDate ? date.toISOString() : undefined,
          changes: changes(entry),
        };
      });
      render({ rows, message: rows.length ? "" : "История пока пуста." });
    } catch (error) {
      if (events.signal.aborted) return;
      if (error instanceof ApiError && (error.status === 401 || error.code === "NOT_FOUND")) {
        onAccessError(error);
        return;
      }

      const message = current.signal.aborted
        ? "Сервер не ответил вовремя."
        : "Не удалось загрузить историю.";
      render({ message, retry: true });
    } finally {
      window.clearTimeout(timeout);
      request = undefined;
    }
  }

  main.addEventListener(
    "click",
    (event) => {
      if (event.target instanceof Element && event.target.closest("[data-history-retry]")) {
        void load();
      }
    },
    { signal: events.signal }
  );

  void load();
  return () => {
    events.abort();
    request?.abort();
  };
}
