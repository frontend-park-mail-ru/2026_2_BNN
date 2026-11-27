import { api, ApiError } from "@/api";

export function mountCollaborationDialog(options: {
  page: HTMLElement;
  getNoteId: () => string | undefined;
  isActive: () => boolean;
  showToast: (message: string, isError?: boolean) => void;
  onUnauthorized: () => Promise<void>;
}) {
  const dialog = options.page.querySelector<HTMLDialogElement>("[data-collaboration-dialog]");
  const form = dialog?.querySelector<HTMLFormElement>("[data-collaboration-form]");
  const input = dialog?.querySelector<HTMLInputElement>("[data-collaboration-login]");
  const submit = dialog?.querySelector<HTMLButtonElement>("[data-collaboration-submit]");
  const roleSelect = dialog?.querySelector<HTMLSelectElement>("[data-collaboration-role]");
  const errorLabel = dialog?.querySelector<HTMLElement>("[data-collaboration-error]");
  const link = dialog?.querySelector<HTMLAnchorElement>("[data-collaboration-link]");

  if (!dialog || !form || !input || !submit || !roleSelect || !errorLabel || !link) return null;

  const events = new AbortController();
  let pending = false;
  let version = 0;
  let openedNoteId: string | undefined;

  const showError = (message: string): void => {
    errorLabel.textContent = message;
    errorLabel.hidden = !message;
  };

  const close = (): void => {
    version += 1;
    dialog.close();
  };

  const copyLink = async (): Promise<void> => {
    const id = openedNoteId;
    if (!options.isActive() || !dialog.open || !id || options.getNoteId() !== id) return;

    const requestVersion = version;
    const isCurrent = () =>
      options.isActive() && dialog.open && version === requestVersion && options.getNoteId() === id;

    showError("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link.href);
      if (isCurrent()) options.showToast("Ссылка скопирована");
    } catch {
      if (isCurrent()) {
        showError(
          "Не удалось скопировать. Используйте пункт «Копировать адрес ссылки» в меню ссылки."
        );
      }
    }
  };

  const invite = async (): Promise<void> => {
    if (pending) return;

    const id = openedNoteId;
    if (!options.isActive() || !id || options.getNoteId() !== id) return;

    const login = input.value.trim();
    if (!login) {
      showError("Введите логин пользователя");
      input.focus();
      return;
    }

    const role = roleSelect.value;

    if (role !== "viewer" && role !== "editor") {
      showError("Выберите право доступа");
      return;
    }

    const requestVersion = version;
    const isCurrent = () =>
      options.isActive() && dialog.open && version === requestVersion && options.getNoteId() === id;

    pending = true;
    input.readOnly = true;
    roleSelect.disabled = true;
    submit.disabled = true;
    submit.textContent = "Отправляем…";
    showError("");

    try {
      await api.addCollaborator(id, login, role);
      if (!isCurrent()) return;

      close();
      options.showToast(
        role === "viewer"
          ? "Доступ на просмотр предоставлен"
          : "Доступ на редактирование предоставлен"
      );
    } catch (error) {
      if (!isCurrent()) return;

      if (error instanceof ApiError && error.status === 401) {
        void options.onUnauthorized();
        return;
      }

      showError(error instanceof ApiError ? error.message : "Не удалось связаться с сервером");
    } finally {
      pending = false;
      input.readOnly = false;
      roleSelect.disabled = false;
      submit.disabled = false;
      submit.textContent = "Отправить";
    }
  };

  options.page.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest("[data-collaboration-close]")) {
        close();
        return;
      }

      if (target.closest("[data-collaboration-copy]")) {
        void copyLink();
        return;
      }

      if (!target.closest("[data-collaboration-open]")) return;

      const id = options.getNoteId();
      if (!id || id === "new") {
        options.showToast("Сначала сохраните заметку");
        return;
      }

      if (dialog.open) return;

      version += 1;
      openedNoteId = id;
      form.reset();
      const url = new URL(`/notes/${encodeURIComponent(id)}`, window.location.origin);
      link.href = url.href;
      link.textContent = url.href;
      link.title = url.href;
      showError("");
      dialog.showModal();
      input.focus();
    },
    { signal: events.signal }
  );

  form.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      void invite();
    },
    { signal: events.signal }
  );

  return {
    close,
    destroy(): void {
      events.abort();
      close();
    },
  };
}
