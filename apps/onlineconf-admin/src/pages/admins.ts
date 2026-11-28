import { ApiError, listAdmins, searchUsers, setAdminAccess } from "../api/api";
import template from "../templates/admins.hbs";
import type { AdminUser } from "../types/onlineconf";

/** Управляет правами администраторов и отменяет запрос при уходе с экрана. */
export function mountAdmins(
  main: HTMLElement,
  ownLogin: string,
  onAccessError: (error: ApiError) => void
): () => void {
  main.innerHTML = template({});

  const status = main.querySelector<HTMLElement>("[data-admins-status]")!;
  const list = main.querySelector<HTMLUListElement>("[data-admins-list]")!;
  const results = main.querySelector<HTMLUListElement>("[data-admins-results]")!;
  const search = main.querySelector<HTMLFormElement>("[data-admins-search]")!;
  const query = search.querySelector<HTMLInputElement>("input")!;
  const reload = main.querySelector<HTMLButtonElement>("[data-admins-reload]")!;
  const controls = main.querySelectorAll<HTMLFieldSetElement>("[data-admins-controls]");
  const searchControls = search.querySelector<HTMLFieldSetElement>("fieldset")!;
  const events = new AbortController();
  const { signal } = events;

  let pending: AbortController | undefined;
  let admins: AdminUser[] = [];
  let found: AdminUser[] = [];
  let listReady = false;

  function syncControls(): void {
    for (const fieldset of controls) fieldset.disabled = Boolean(pending);
    searchControls.disabled = Boolean(pending) || !listReady;
  }

  function createRow(user: AdminUser, granted: boolean): HTMLLIElement {
    const row = document.createElement("li");
    const login = document.createElement("span");
    login.textContent = user.login;
    row.append(login);

    if (granted && user.login === ownLogin) {
      login.textContent = `${user.login} (вы)`;
      return row;
    }

    if (!granted && admins.some((admin) => admin.id === user.id)) {
      row.append("Уже администратор");
      return row;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = granted ? "Отозвать доступ" : "Выдать доступ";
    button.setAttribute("aria-label", `${button.textContent}: ${user.login}`);
    button.disabled = !listReady;
    button.addEventListener("click", () => changeAccess(user, !granted));
    row.append(button);
    return row;
  }

  function renderLists(): void {
    list.replaceChildren(...admins.map((admin) => createRow(admin, true)));
    results.replaceChildren(...found.map((user) => createRow(user, false)));
  }

  /** Выполняет одну операцию за раз и не применяет ответ после ухода со страницы. */
  async function run(
    loading: string,
    failure: string,
    action: (requestSignal: AbortSignal) => Promise<void>,
    missingMeansAccessDenied = true
  ): Promise<void> {
    if (pending || signal.aborted) return;
    const current = new AbortController();
    pending = current;
    const timeout = window.setTimeout(() => current.abort(), 10_000);
    syncControls();
    status.textContent = loading;

    try {
      await action(current.signal);
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError) {
        if (error.status === 401 || (missingMeansAccessDenied && error.code === "NOT_FOUND")) {
          onAccessError(error);
          return;
        }
        if (error.code === "NOT_FOUND") {
          status.textContent = "Пользователь не найден или операция недоступна.";
          return;
        }
      }
      status.textContent = current.signal.aborted ? "Сервер не ответил вовремя." : failure;
    } finally {
      window.clearTimeout(timeout);
      pending = undefined;
      if (!signal.aborted) syncControls();
    }
  }

  async function readList(requestSignal: AbortSignal): Promise<void> {
    const fresh = await listAdmins(requestSignal);
    if (signal.aborted) return;
    admins = fresh;
    listReady = true;
    renderLists();
  }

  function load(): void {
    void run(
      "Загружаем администраторов…",
      "Не удалось загрузить список. Попробуйте ещё раз.",
      async (requestSignal) => {
        await readList(requestSignal);
        if (signal.aborted) return;
        status.textContent = admins.length ? "" : "Список администраторов пуст.";
      }
    );
  }

  function changeAccess(user: AdminUser, grant: boolean): void {
    if (pending || !listReady || (!grant && (user.login === ownLogin || !ownLogin))) return;

    const verb = grant ? "Выдать доступ" : "Отозвать доступ";
    if (!window.confirm(`${verb} для «${user.login}»?`)) return;

    void run(
      "Сохраняем права…",
      "Не удалось подтвердить изменение. Обновите список.",
      async (requestSignal) => {
        listReady = false;
        await setAdminAccess(user.id, grant, requestSignal);
        if (signal.aborted) return;

        const saved = grant ? "Доступ выдан." : "Доступ отозван.";
        try {
          await readList(requestSignal);
          if (!signal.aborted)
            status.textContent = `${saved} Права могут обновляться до 15 секунд.`;
        } catch (error) {
          if (error instanceof ApiError && (error.status === 401 || error.code === "NOT_FOUND")) {
            if (!signal.aborted) onAccessError(error);
            return;
          }
          if (!signal.aborted)
            status.textContent = `${saved} Не удалось перечитать список. Обновите его вручную.`;
        }
      },
      false
    ).finally(() => {
      if (!signal.aborted && !listReady) renderLists();
    });
  }

  reload.addEventListener("click", load, { signal });
  query.addEventListener(
    "input",
    () => {
      found = [];
      results.replaceChildren();
      status.textContent = "";
    },
    { signal }
  );
  search.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      if (pending || !listReady) return;

      const login = query.value.trim();
      if (!login) {
        status.textContent = "Введите логин для поиска.";
        return;
      }

      found = [];
      results.replaceChildren();
      void run(
        "Ищем пользователей…",
        "Не удалось найти пользователей. Повторите поиск.",
        async (requestSignal) => {
          const users = await searchUsers(login, requestSignal);
          if (signal.aborted) return;
          found = users;
          renderLists();
          status.textContent = found.length
            ? `Найдено пользователей: ${found.length}.`
            : "Пользователи не найдены.";
        }
      );
    },
    { signal }
  );

  load();
  return () => {
    events.abort();
    pending?.abort();
  };
}
