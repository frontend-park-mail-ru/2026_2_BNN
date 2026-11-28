import { ApiError, evaluateFlag, searchUsers } from "../api/api";
import template from "../templates/flag-evaluation.hbs";
import type { FlagEvaluation } from "../types/onlineconf";

const REASONS: Record<FlagEvaluation["reason"], string> = {
  disabled: "Флаг выключен глобально",
  excluded: "Пользователь принудительно исключён",
  included: "Пользователь принудительно включён",
  rollout: "По проценту раскатки",
};

/** Проверяет сохранённый флаг отдельно от формы редактирования. */
export function mountFlagEvaluation(
  host: HTMLElement,
  keyId: string,
  onAccessError: (error: ApiError) => void
) {
  host.innerHTML = template({});

  const search = host.querySelector<HTMLFormElement>("[data-evaluate-search]")!;
  const check = host.querySelector<HTMLFormElement>("[data-evaluate-check]")!;
  const query = search.querySelector<HTMLInputElement>("input")!;
  const users = check.querySelector<HTMLSelectElement>("select")!;
  const searchButton = search.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const checkButton = check.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = host.querySelector<HTMLElement>("[data-evaluate-status]")!;
  const result = host.querySelector<HTMLElement>("[data-evaluate-result]")!;
  const fieldsets = host.querySelectorAll("fieldset");
  const events = new AbortController();
  const { signal } = events;
  let pending: AbortController | undefined;

  function clearResult(): void {
    pending?.abort();
    pending = undefined;
    searchButton.disabled = false;
    checkButton.disabled = false;
    status.textContent = "";
    result.textContent = "";
  }

  /** Выполняет один запрос с таймаутом и игнорирует отменённый результат. */
  async function run<T>(
    button: HTMLButtonElement,
    loading: string,
    failure: string,
    request: (signal: AbortSignal) => Promise<T>,
    show: (value: T) => void
  ): Promise<void> {
    clearResult();
    const current = new AbortController();
    pending = current;
    button.disabled = true;
    status.textContent = loading;
    const timeout = window.setTimeout(() => current.abort(), 10_000);

    try {
      const value = await request(current.signal);
      if (pending !== current) return;
      status.textContent = "";
      show(value);
    } catch (error) {
      if (pending !== current) return;
      if (error instanceof ApiError && (error.status === 401 || error.code === "NOT_FOUND")) {
        onAccessError(error);
        return;
      }
      status.textContent = current.signal.aborted ? "Сервер не ответил вовремя." : failure;
    } finally {
      window.clearTimeout(timeout);
      if (pending === current) {
        pending = undefined;
        button.disabled = false;
      }
    }
  }

  function resetSearch(): void {
    clearResult();
    users.replaceChildren();
    check.hidden = true;
  }

  query.addEventListener("input", resetSearch, { signal });
  users.addEventListener("change", clearResult, { signal });

  search.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      if (searchButton.disabled) return;
      resetSearch();
      const login = query.value.trim();
      if (!login) {
        status.textContent = "Введите логин для поиска.";
        return;
      }

      void run(
        searchButton,
        "Ищем пользователей…",
        "Не удалось найти пользователей.",
        (requestSignal) => searchUsers(login, requestSignal),
        (found) => {
          const unique = new Map(found.map(({ id, login }) => [id, login]));
          if (!unique.size) {
            status.textContent = "Пользователи не найдены.";
            return;
          }
          users.replaceChildren(
            new Option("Выберите пользователя", ""),
            ...Array.from(unique, ([id, login]) => new Option(login, id))
          );
          check.hidden = false;
          status.textContent = `Найдено пользователей: ${unique.size}.`;
        }
      );
    },
    { signal }
  );

  check.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      const userId = users.value;
      if (!userId || checkButton.disabled) return;

      const login = users.selectedOptions[0]?.textContent ?? "";
      void run(
        checkButton,
        "Проверяем флаг…",
        "Не удалось проверить флаг.",
        (requestSignal) => evaluateFlag(keyId, userId, requestSignal),
        (evaluation) => {
          const state = evaluation.result ? "Включён" : "Выключен";
          result.textContent = `${login} — ${state}. ${REASONS[evaluation.reason]}. Ревизия: ${evaluation.revision}.`;
        }
      );
    },
    { signal }
  );

  return {
    setDisabled(disabled: boolean): void {
      if (disabled) clearResult();
      for (const fieldset of fieldsets) fieldset.disabled = disabled;
    },
    destroy(): void {
      clearResult();
      events.abort();
      host.replaceChildren();
    },
  };
}
