import { api, ApiError, type Tag } from "../api";
import {
  TAG_NAME_MAX_LENGTH,
  TAG_PALETTE,
  findTagByName,
  nextTagColor,
  safeTagColor,
  toTagView,
} from "../utils/tags";

const NETWORK_ERROR = "Не удалось связаться с сервером";

/** Колбэки, через которые страница заметок узнаёт об изменении тегов. */
export interface TagsDialogOptions {
  /** Текущий список тегов. */
  getTags: () => Tag[];
  /** Тег создан или изменён. */
  onSaved: (tag: Tag) => void;
  /** Тег удалён. */
  onDeleted: (id: string) => void;
  /** Сессия истекла. */
  onUnauthorized: () => Promise<void>;
}

/** Управление модалкой тегов. */
export interface TagsDialog {
  open: () => void;
  destroy: () => void;
}

/**
 * Готовит данные формы создания или изменения тега.
 *
 * @param id Идентификатор тега или пустая строка для нового.
 * @param name Название.
 * @param color Выбранный цвет.
 * @returns Данные для шаблона `tag-form`.
 */
function formView(id: string, name: string, color: string) {
  const selected = safeTagColor(color).toUpperCase();
  const palette = TAG_PALETTE.map((item) => ({ ...item, isSelected: item.color === selected }));
  if (!palette.some((item) => item.isSelected)) {
    palette.unshift({ color: selected, label: "Текущий цвет", isSelected: true });
  }
  return { id, name, palette, submitLabel: id ? "Сохранить" : "Добавить", error: "" };
}

/**
 * Проверяет название тега до запроса на сервер.
 *
 * @param tags Существующие теги.
 * @param name Название без пробелов по краям.
 * @param id Идентификатор изменяемого тега или пустая строка.
 * @returns Текст ошибки или пустая строка.
 */
function getTagNameError(tags: Tag[], name: string, id: string): string {
  if (name === "") {
    return "Введите название";
  }
  if (name.length > TAG_NAME_MAX_LENGTH) {
    return `Не больше ${TAG_NAME_MAX_LENGTH} символов`;
  }
  const same = findTagByName(tags, name);
  if (same && same.id !== id) {
    return "Тег с таким названием уже есть";
  }
  return "";
}

/**
 * Подключает модалку создания, изменения и удаления тегов.
 *
 * @param page Корень `.notes` с разметкой `[data-tags-dialog]`.
 * @param options Колбэки страницы заметок.
 * @returns Управление модалкой или `null`, если разметки нет.
 */
export function mountTagsDialog(page: HTMLElement, options: TagsDialogOptions): TagsDialog | null {
  const dialogElement = page.querySelector<HTMLElement>("[data-tags-dialog]");
  const bodyElement = dialogElement?.querySelector<HTMLElement>("[data-tags-body]");
  if (!dialogElement || !bodyElement) {
    return null;
  }

  const dialog = dialogElement;
  const body = bodyElement;

  let editingId: string | null = null;
  let confirmingId: string | null = null;
  let error = "";
  let busy = false;

  function render(): void {
    const tags = options.getTags();
    body.innerHTML = Handlebars.partials["tags-manager"]({
      createForm: formView("", "", nextTagColor(tags)),
      tags: tags.map((tag) => ({
        ...toTagView(tag),
        isConfirming: tag.id === confirmingId,
        form: tag.id === editingId ? formView(tag.id, tag.name, tag.color) : null,
      })),
      error: error,
    });
  }

  function focusForm(id: string): void {
    const input = body.querySelector<HTMLInputElement>(
      `[data-tag-form="${id}"] input[name="name"]`
    );
    input?.focus();
    input?.select();
  }

  function open(): void {
    editingId = null;
    confirmingId = null;
    error = "";
    render();
    dialog.hidden = false;
    focusForm("");
  }

  function close(): void {
    if (busy) {
      return;
    }
    dialog.hidden = true;
    body.innerHTML = "";
  }

  function readError(caught: unknown): string {
    return caught instanceof ApiError ? caught.message : NETWORK_ERROR;
  }

  async function saveTag(form: HTMLFormElement): Promise<void> {
    const id = form.dataset.tagForm ?? "";
    const nameInput = form.elements.namedItem("name") as HTMLInputElement;
    const colorInput = form.querySelector<HTMLInputElement>("input[name='color']:checked");
    const errorLabel = form.querySelector<HTMLElement>("[data-tag-form-error]");
    const name = nameInput.value.trim();
    const color = colorInput?.value ?? nextTagColor(options.getTags());

    const message = getTagNameError(options.getTags(), name, id);
    if (errorLabel) {
      errorLabel.textContent = message;
    }
    if (message) {
      nameInput.focus();
      return;
    }

    const submit = form.querySelector<HTMLButtonElement>("[type='submit']");
    busy = true;
    if (submit) {
      submit.disabled = true;
    }

    try {
      const saved = id
        ? await api.updateTag(id, { name, color })
        : await api.createTag({ name, color });
      options.onSaved(saved);
      editingId = null;
      error = "";
      render();
      focusForm("");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        busy = false;
        close();
        await options.onUnauthorized();
        return;
      }
      if (errorLabel?.isConnected) {
        errorLabel.textContent = readError(caught);
      }
    } finally {
      busy = false;
      if (submit?.isConnected) {
        submit.disabled = false;
      }
    }
  }

  async function deleteTag(id: string): Promise<void> {
    busy = true;
    try {
      await api.deleteTag(id);
      options.onDeleted(id);
      error = "";
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        busy = false;
        close();
        await options.onUnauthorized();
        return;
      }
      if (caught instanceof ApiError && caught.status === 404) {
        options.onDeleted(id);
      } else {
        error = readError(caught);
      }
    } finally {
      busy = false;
    }
    confirmingId = null;
    if (!dialog.hidden) {
      render();
    }
  }

  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || busy) {
      return;
    }

    if (target === dialog || target.closest("[data-tags-close]")) {
      close();
      return;
    }

    const deleteButton = target.closest<HTMLElement>("[data-tag-delete]");
    if (deleteButton) {
      const id = deleteButton.dataset.tagDelete ?? "";
      if (confirmingId === id) {
        void deleteTag(id);
        return;
      }
      confirmingId = id;
      editingId = null;
      render();
      body.querySelector<HTMLElement>(`[data-tag-delete="${id}"]`)?.focus();
      return;
    }

    const editButton = target.closest<HTMLElement>("[data-tag-edit]");
    if (editButton) {
      editingId = editButton.dataset.tagEdit ?? null;
      confirmingId = null;
      render();
      if (editingId) {
        focusForm(editingId);
      }
      return;
    }

    if (target.closest("[data-tag-edit-cancel]")) {
      editingId = null;
      render();
      return;
    }

    if (confirmingId && !target.closest("[data-tag-delete]")) {
      confirmingId = null;
      render();
    }
  }

  function onSubmit(event: SubmitEvent): void {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-tag-form]")) {
      return;
    }
    event.preventDefault();
    if (!busy) {
      void saveTag(form);
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || dialog.hidden) {
      return;
    }
    if (editingId || confirmingId) {
      editingId = null;
      confirmingId = null;
      render();
      return;
    }
    close();
  }

  function onInput(event: Event): void {
    const input = event.target;
    if (input instanceof HTMLInputElement && input.name === "name") {
      const errorLabel = input.form?.querySelector<HTMLElement>("[data-tag-form-error]");
      if (errorLabel) {
        errorLabel.textContent = "";
      }
    }
  }

  dialog.addEventListener("click", onClick);
  dialog.addEventListener("submit", onSubmit);
  dialog.addEventListener("input", onInput);
  page.addEventListener("keydown", onKeyDown);

  return {
    open: open,
    destroy: () => {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("submit", onSubmit);
      dialog.removeEventListener("input", onInput);
      page.removeEventListener("keydown", onKeyDown);
    },
  };
}
