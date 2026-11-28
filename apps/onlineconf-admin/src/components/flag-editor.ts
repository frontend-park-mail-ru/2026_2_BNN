import { ApiError, searchUsers } from "../api/api";
import template from "../templates/flag-editor.hbs";
import type { AdminUser, FlagRead, FlagWrite } from "../types/onlineconf";

const MAX_USERS = 100;
type Rule = "include" | "exclude";

type FlagEditorOptions = {
  initial?: FlagRead;
  onChange?: () => void;
  onAccessError?: (error: ApiError) => void;
};

function find<T extends Element>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Flag editor: missing ${selector}`);
  return element;
}

function makeButton(text: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  return button;
}

/** Подключает поля флага к общей форме и возвращает интерфейс чтения и очистки. */
export function mountFlagEditor(host: HTMLElement, options: FlagEditorOptions = {}) {
  host.innerHTML = template({});

  const fieldset = find<HTMLFieldSetElement>(host, ".flag-editor");
  const enabled = find<HTMLInputElement>(host, "[data-flag-enabled]");
  const range = find<HTMLInputElement>(host, "[data-flag-range]");
  const percent = find<HTMLInputElement>(host, "[data-flag-percent]");
  const query = find<HTMLInputElement>(host, "[data-flag-query]");
  const searchButton = find<HTMLButtonElement>(host, "[data-flag-search]");
  const searchStatus = find<HTMLElement>(host, "[data-flag-search-status]");
  const results = find<HTMLUListElement>(host, "[data-flag-results]");
  const percentError = find<HTMLElement>(host, "[data-flag-percent-error]");
  const feedback = find<HTMLElement>(host, "[data-flag-feedback]");

  const lists = {
    include: find<HTMLUListElement>(host, "[data-flag-include]"),
    exclude: find<HTMLUListElement>(host, "[data-flag-exclude]"),
  };
  const counts = {
    include: find<HTMLElement>(host, "[data-flag-include-count]"),
    exclude: find<HTMLElement>(host, "[data-flag-exclude-count]"),
  };

  const { initial, onChange } = options;
  const selected = {
    include: new Map(initial?.include_users.map((user) => [user.id, user])),
    exclude: new Map(initial?.exclude_users.map((user) => [user.id, user])),
  };

  const events = new AbortController();
  const { signal } = events;
  let pending: AbortController | undefined;
  let found: AdminUser[] = [];

  enabled.checked = initial?.enabled ?? false;
  percent.value = String(initial?.rollout_percent ?? 0);
  range.value = percent.value;

  /** Проверяет лимит списка и уникальность пользователя среди обоих правил. */
  function canAdd(rule: Rule, userId: string): boolean {
    return (
      selected[rule].size < MAX_USERS &&
      !selected.include.has(userId) &&
      !selected.exclude.has(userId)
    );
  }

  function renderResults(): void {
    results.replaceChildren();

    for (const user of found) {
      const row = document.createElement("li");
      const login = document.createElement("span");
      login.textContent = user.login;
      row.append(login);

      for (const rule of ["include", "exclude"] as const) {
        const title = rule === "include" ? "Включить" : "Исключить";
        const button = makeButton(title);
        button.setAttribute("aria-label", `${title} пользователя ${user.login}`);
        button.disabled = !canAdd(rule, user.id);

        button.addEventListener("click", () => {
          if (!canAdd(rule, user.id)) return;
          selected[rule].set(user.id, user);
          renderSelection(rule);
          renderResults();
          query.focus();
          feedback.textContent = `${user.login} добавлен в список.`;
          onChange?.();
        });

        row.append(button);
      }

      if (selected.include.has(user.id) || selected.exclude.has(user.id)) {
        const status = document.createElement("span");
        status.textContent = selected.include.has(user.id)
          ? "В списке включения"
          : "В списке исключения";
        row.append(status);
      }

      results.append(row);
    }
  }

  function renderSelection(rule: Rule): void {
    const list = lists[rule];
    list.replaceChildren();
    list.removeAttribute("aria-invalid");
    counts[rule].textContent = `(${selected[rule].size}/${MAX_USERS})`;

    for (const user of selected[rule].values()) {
      const item = document.createElement("li");
      const remove = makeButton("×");
      const listName = rule === "include" ? "включения" : "исключения";
      remove.setAttribute("aria-label", `Убрать ${user.login} из списка ${listName}`);

      remove.addEventListener("click", () => {
        selected[rule].delete(user.id);
        renderSelection(rule);
        renderResults();
        (list.querySelector("button") ?? query).focus();
        feedback.textContent = `${user.login} удалён из списка.`;
        onChange?.();
      });

      item.append(user.login, remove);
      list.append(item);
    }
  }

  /** Отменяет текущий поиск и очищает его результаты. */
  function clearSearch(): void {
    pending?.abort();
    pending = undefined;
    searchButton.disabled = false;
    found = [];
    results.replaceChildren();
    searchStatus.textContent = "";
  }

  /** Ищет пользователей по логину и применяет результат последнего запроса. */
  async function runSearch(): Promise<void> {
    clearSearch();
    const login = query.value.trim();
    if (!login) {
      searchStatus.textContent = "Введите логин для поиска.";
      query.focus();
      return;
    }

    const request = new AbortController();
    pending = request;
    const timeout = window.setTimeout(() => request.abort(), 10_000);
    searchButton.disabled = true;
    searchStatus.textContent = "Поиск…";

    try {
      const users = await searchUsers(login, request.signal);
      if (pending !== request) return;

      found = [...new Map(users.map((user) => [user.id, user])).values()];
      renderResults();
      searchStatus.textContent = found.length
        ? `Найдено: ${found.length}`
        : "Пользователи не найдены.";
    } catch (error) {
      if (pending !== request) return;

      if (error instanceof ApiError && (error.status === 401 || error.code === "NOT_FOUND")) {
        options.onAccessError?.(error);
        return;
      }
      searchStatus.textContent =
        error instanceof ApiError && error.status === 401
          ? "Сессия истекла. Войдите снова."
          : error instanceof ApiError && error.code === "NOT_FOUND"
            ? "Поиск недоступен."
            : "Не удалось найти пользователей. Повторите поиск.";
    } finally {
      clearTimeout(timeout);
      if (pending === request) {
        pending = undefined;
        searchButton.disabled = false;
      }
    }
  }

  function clearPercentError(): void {
    percentError.textContent = "";
    percent.removeAttribute("aria-invalid");
    range.removeAttribute("aria-invalid");
  }

  function showPercentError(message = "Укажите целый процент от 0 до 100."): void {
    percentError.textContent = message;
    percent.setAttribute("aria-invalid", "true");
    range.setAttribute("aria-invalid", "true");
  }

  function showError(message: string): HTMLElement | undefined {
    if (/\brollout_percent\b/i.test(message)) {
      showPercentError(message);
      return percent;
    }
    for (const rule of ["include", "exclude"] as const) {
      if (message.includes(`${rule}_user`)) {
        feedback.textContent = message;
        lists[rule].setAttribute("aria-invalid", "true");
        return lists[rule];
      }
    }
    if (/\benabled\b/i.test(message)) {
      feedback.textContent = message;
      enabled.setAttribute("aria-invalid", "true");
      return enabled;
    }
    return undefined;
  }

  percent.addEventListener("invalid", () => showPercentError(), { signal });

  /** Проверяет поля флага и собирает модель записи с ID пользователей. */
  function read(): FlagWrite | null {
    const value = percent.valueAsNumber;
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      showPercentError();
      percent.focus();
      return null;
    }

    if (
      selected.include.size > MAX_USERS ||
      selected.exclude.size > MAX_USERS ||
      [...selected.include.keys()].some((id) => selected.exclude.has(id))
    ) {
      feedback.textContent =
        "В каждом списке может быть до 100 пользователей. Уберите пересечения.";
      return null;
    }

    feedback.textContent = "";
    return {
      enabled: enabled.checked,
      rollout_percent: value,
      include_user_ids: [...selected.include.keys()],
      exclude_user_ids: [...selected.exclude.keys()],
    };
  }

  enabled.addEventListener(
    "change",
    () => {
      enabled.removeAttribute("aria-invalid");
      feedback.textContent = "";
      onChange?.();
    },
    { signal }
  );

  range.addEventListener(
    "input",
    () => {
      percent.value = range.value;
      clearPercentError();
      feedback.textContent = "";
      onChange?.();
    },
    { signal }
  );

  percent.addEventListener(
    "input",
    () => {
      if (percent.validity.valid) {
        range.value = percent.value;
        clearPercentError();
        feedback.textContent = "";
      }
      onChange?.();
    },
    { signal }
  );

  query.addEventListener("input", clearSearch, { signal });
  query.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      if (!event.repeat) searchButton.click();
    },
    { signal }
  );
  searchButton.addEventListener("click", () => void runSearch(), { signal });

  renderSelection("include");
  renderSelection("exclude");

  return {
    read,
    showError,
    setDisabled(disabled: boolean): void {
      fieldset.disabled = disabled;
    },
    destroy(): void {
      clearSearch();
      events.abort();
      fieldset.remove();
    },
  };
}
